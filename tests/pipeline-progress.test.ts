import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { advanceCandidate, failCandidate, moveCandidate } from "@/lib/pipeline-progress";
import { withdrawApplication } from "@/lib/applications";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "pipeline-progress-test.venturepath.local";

const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

beforeEach(() => {
  sendEmailSpy.mockClear();
});

async function createOrganisation() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme",
          description: "Tools",
          industry: "Manufacturing",
          location: "Pune",
          status: "approved",
        },
      },
    },
  });
}

async function createCandidate() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test candidate",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Marketing intern",
  description: "Social media.",
  skills: [],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 10000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: null,
  experienceLevel: null,
  compensationMin: null,
  compensationMax: null,
};

async function createListing(userId: string) {
  const result = await createOpportunity(userId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function createStage(
  opportunityId: string,
  position: number,
  overrides: Partial<{ name: string; durationMinutes: number | null }> = {},
) {
  return getDb().pipelineStage.create({
    data: {
      opportunityId,
      position,
      name: overrides.name ?? `Stage ${position}`,
      kind: "interview",
      instructions: null,
      externalUrl: null,
      durationMinutes: overrides.durationMinutes ?? 30,
      source: "organisation",
    },
  });
}

async function createApplication(
  opportunityId: string,
  currentStageId: string | null,
  status: "submitted" | "accepted" | "rejected" | "withdrawn" = "submitted",
) {
  const candidate = await createCandidate();
  return getDb().application.create({
    data: {
      opportunityId,
      userProfileId: candidate.userProfile!.id,
      resumeFileName: "cv.pdf",
      resumeStorageKey: `${randomUUID()}.pdf`,
      currentStageId,
      status,
    },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("advanceCandidate", () => {
  it("moves Applied -> stage 1 -> stage 2, then accepts on the last stage", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0, { name: "Screen" });
    const stage2 = await createStage(opportunityId, 1, { name: "Onsite" });
    const application = await createApplication(opportunityId, null);

    const first = await advanceCandidate(owner.id, application.id, null);
    expect(first).toEqual({ ok: true, stageId: stage1.id, accepted: false });
    expect(await getDb().stageEvent.count({ where: { applicationId: application.id } })).toBe(0);

    const second = await advanceCandidate(owner.id, application.id, stage1.id);
    expect(second).toEqual({ ok: true, stageId: stage2.id, accepted: false });
    const afterSecond = await getDb().stageEvent.findMany({
      where: { applicationId: application.id },
    });
    expect(afterSecond).toMatchObject([{ stageId: stage1.id, outcome: "passed" }]);

    const third = await advanceCandidate(owner.id, application.id, stage2.id);
    expect(third).toEqual({ ok: true, stageId: stage2.id, accepted: true });
    await settleBackground();

    const updated = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.status).toBe("accepted");
    expect(updated.decidedAt).not.toBeNull();
    expect(updated.currentStageId).toBe(stage2.id);

    const events = await getDb().stageEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toMatchObject([
      { stageId: stage1.id, outcome: "passed" },
      { stageId: stage2.id, outcome: "passed" },
    ]);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("accepted") }),
    );
  });

  it("refuses a stale expectedStageId", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);

    expect(await advanceCandidate(owner.id, application.id, null)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("returns not_found for another organisation's application", async () => {
    const owner = await createOrganisation();
    const other = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);

    expect(await advanceCandidate(other.id, application.id, stage1.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns stale for a non-submitted application", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id, "withdrawn");

    expect(await advanceCandidate(owner.id, application.id, stage1.id)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("returns invalid for a listing without a pipeline", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const application = await createApplication(opportunityId, null);

    expect(await advanceCandidate(owner.id, application.id, null)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("failCandidate", () => {
  it("rejects the application and records a failed StageEvent", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);

    const result = await failCandidate(owner.id, application.id, stage1.id);
    expect(result).toEqual({ ok: true });
    await settleBackground();

    const updated = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.status).toBe("rejected");
    expect(updated.decidedAt).not.toBeNull();

    const events = await getDb().stageEvent.findMany({ where: { applicationId: application.id } });
    expect(events).toMatchObject([{ stageId: stage1.id, outcome: "failed" }]);
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("rejects from Applied without writing a StageEvent", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, null);

    expect(await failCandidate(owner.id, application.id, null)).toEqual({ ok: true });
    expect(await getDb().stageEvent.count({ where: { applicationId: application.id } })).toBe(0);
  });

  it("returns invalid for a listing without a pipeline", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const application = await createApplication(opportunityId, null);

    expect(await failCandidate(owner.id, application.id, null)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("moveCandidate", () => {
  it("moves to another stage and back to Applied, without changing status", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const stage2 = await createStage(opportunityId, 1);
    const application = await createApplication(opportunityId, stage1.id);

    const moved = await moveCandidate(owner.id, application.id, stage1.id, stage2.id);
    expect(moved).toEqual({ ok: true, stageId: stage2.id });
    let updated = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.status).toBe("submitted");
    expect(updated.currentStageId).toBe(stage2.id);

    const back = await moveCandidate(owner.id, application.id, stage2.id, null);
    expect(back).toEqual({ ok: true, stageId: null });
    updated = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.currentStageId).toBeNull();

    const events = await getDb().stageEvent.findMany({
      where: { applicationId: application.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toMatchObject([
      { stageId: stage2.id, outcome: "moved" },
      { stageId: stage2.id, outcome: "moved" },
    ]);
  });

  it("refuses a target stage from a different listing", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const otherOpportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const otherStage = await createStage(otherOpportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);

    expect(await moveCandidate(owner.id, application.id, stage1.id, otherStage.id)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("cancels future scheduled events", () => {
  it("cancels the old stage's future events when a candidate advances past it", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const stage2 = await createStage(opportunityId, 1);
    const application = await createApplication(opportunityId, stage1.id);
    const futureEvent = await getDb().scheduledEvent.create({
      data: {
        applicationId: application.id,
        stageId: stage1.id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });

    await advanceCandidate(owner.id, application.id, stage1.id);
    await settleBackground();

    const cancelled = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: futureEvent.id },
    });
    expect(cancelled.status).toBe("cancelled");
    void stage2;
  });

  it("cancels the old stage's future events when a candidate is moved off it", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const stage2 = await createStage(opportunityId, 1);
    const application = await createApplication(opportunityId, stage2.id);
    const futureEvent = await getDb().scheduledEvent.create({
      data: {
        applicationId: application.id,
        stageId: stage2.id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });

    await moveCandidate(owner.id, application.id, stage2.id, stage1.id);
    await settleBackground();

    const cancelled = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: futureEvent.id },
    });
    expect(cancelled.status).toBe("cancelled");
  });

  it("cancels all future events when the application is rejected", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);
    const futureEvent = await getDb().scheduledEvent.create({
      data: {
        applicationId: application.id,
        stageId: stage1.id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });

    await failCandidate(owner.id, application.id, stage1.id);
    await settleBackground();

    const cancelled = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: futureEvent.id },
    });
    expect(cancelled.status).toBe("cancelled");
  });

  it("cancels all future events when the candidate withdraws", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0);
    const application = await createApplication(opportunityId, stage1.id);
    const futureEvent = await getDb().scheduledEvent.create({
      data: {
        applicationId: application.id,
        stageId: stage1.id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });
    const candidate = await getDb().application.findUniqueOrThrow({
      where: { id: application.id },
      include: { userProfile: true },
    });

    expect(await withdrawApplication(candidate.userProfile.userId, application.id)).toEqual({
      ok: true,
    });
    await settleBackground();

    const cancelled = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: futureEvent.id },
    });
    expect(cancelled.status).toBe("cancelled");
  });
});
