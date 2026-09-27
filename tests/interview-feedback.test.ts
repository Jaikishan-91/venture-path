import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { submitFeedback, listFeedbackForApplications } from "@/lib/interview-feedback";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { acceptInvite, inviteMember } from "@/lib/team";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "interview-feedback-test.venturepath.local";

const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

beforeEach(() => {
  sendEmailSpy.mockClear();
});

function uniqueEmail(prefix = "person") {
  return `${prefix}-${randomUUID()}@${EMAIL_DOMAIN}`;
}

function unwrap<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got failure: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function createOrganisation(status: OrganisationStatus = "approved") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: uniqueEmail("org"),
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme",
          description: "Tools",
          industry: "Manufacturing",
          location: "Pune",
          status,
        },
      },
    },
    include: { organisationProfile: true },
  });
}

async function createCandidate(name = "Real Candidate") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name,
      email: uniqueEmail("candidate"),
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

async function createListing(ownerUserId: string) {
  const result = await createOpportunity(ownerUserId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

async function createStage(opportunityId: string) {
  return getDb().pipelineStage.create({
    data: {
      opportunityId,
      position: 0,
      name: "Interview 1",
      kind: "interview",
      source: "organisation",
    },
  });
}

async function createApplication(opportunityId: string, userProfileId: string, stageId: string) {
  return getDb().application.create({
    data: {
      opportunityId,
      userProfileId,
      currentStageId: stageId,
      resumeFileName: "resume.pdf",
      resumeStorageKey: `${randomUUID()}.pdf`,
    },
  });
}

async function createHiringManager(orgOwnerUserId: string, name = "Test HM") {
  const email = uniqueEmail("hm");
  unwrap(await inviteMember(orgOwnerUserId, { name, email }));
  await settleBackground();
  const call = sendEmailSpy.mock.calls.find((c) => c[0].to === email);
  const match = call?.[0].text.match(/\/invite\/(\S+)/);
  if (!match) throw new Error("invite email not found");
  const account = await getDb().user.create({
    data: { id: randomUUID(), name, email, role: null },
  });
  unwrap(await acceptInvite(match[1], account.id));
  return account;
}

async function createScheduledEvent(
  applicationId: string,
  stageId: string,
  interviewerUserIds: string[],
  overrides: { startsAt?: Date; status?: "scheduled" | "cancelled" } = {},
) {
  return getDb().scheduledEvent.create({
    data: {
      applicationId,
      stageId,
      startsAt: overrides.startsAt ?? new Date(Date.now() - 60 * 60 * 1000),
      durationMinutes: 30,
      status: overrides.status ?? "scheduled",
      interviewers: { create: interviewerUserIds.map((userId) => ({ userId })) },
    },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

const validInput = { rating: 4, recommendation: "pass" as const, notes: "Solid interview." };

describe("submitFeedback", () => {
  it("submits, then edits the same feedback (upsert on event + interviewer)", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    const event = await createScheduledEvent(application.id, stage.id, [hm.id]);

    unwrap(await submitFeedback(hm.id, orgId, event.id, validInput));
    let row = await getDb().interviewFeedback.findUniqueOrThrow({
      where: {
        scheduledEventId_interviewerUserId: {
          scheduledEventId: event.id,
          interviewerUserId: hm.id,
        },
      },
    });
    expect(row.rating).toBe(4);
    expect(row.recommendation).toBe("pass");

    unwrap(
      await submitFeedback(hm.id, orgId, event.id, {
        rating: 2,
        recommendation: "fail",
        notes: "Changed my mind after reflection.",
      }),
    );
    row = await getDb().interviewFeedback.findUniqueOrThrow({
      where: {
        scheduledEventId_interviewerUserId: {
          scheduledEventId: event.id,
          interviewerUserId: hm.id,
        },
      },
    });
    expect(row.rating).toBe(2);
    expect(row.recommendation).toBe("fail");
    expect(await getDb().interviewFeedback.count({ where: { scheduledEventId: event.id } })).toBe(
      1,
    );
  });

  it("refuses before the event has started (not_yet)", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    const event = await createScheduledEvent(application.id, stage.id, [hm.id], {
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    expect(await submitFeedback(hm.id, orgId, event.id, validInput)).toEqual({
      ok: false,
      reason: "not_yet",
    });
  });

  it("refuses for a cancelled event", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    const event = await createScheduledEvent(application.id, stage.id, [hm.id], {
      status: "cancelled",
    });

    expect(await submitFeedback(hm.id, orgId, event.id, validInput)).toEqual({
      ok: false,
      reason: "cancelled",
    });
  });

  it("not_found for an HM not assigned to the event", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const assignedHm = await createHiringManager(owner.id, "Assigned");
    const unassignedHm = await createHiringManager(owner.id, "Unassigned");
    const event = await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    expect(await submitFeedback(unassignedHm.id, orgId, event.id, validInput)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects invalid input before touching the database", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    const event = await createScheduledEvent(application.id, stage.id, [hm.id]);

    expect(
      await submitFeedback(hm.id, orgId, event.id, {
        rating: 9,
        recommendation: "pass",
        notes: "x",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await submitFeedback(hm.id, orgId, event.id, {
        rating: 3,
        // @ts-expect-error deliberately invalid for the test
        recommendation: "maybe",
        notes: "x",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("listFeedbackForApplications", () => {
  it("groups feedback by application, scoped to the organisation owner", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id, "Panel HM");
    const event = await createScheduledEvent(application.id, stage.id, [hm.id]);
    unwrap(await submitFeedback(hm.id, owner.organisationProfile!.id, event.id, validInput));

    const forOwner = await listFeedbackForApplications(owner.id, [application.id]);
    expect(forOwner[application.id]).toHaveLength(1);
    expect(forOwner[application.id][0]).toMatchObject({
      stageName: "Interview 1",
      interviewerName: "Panel HM",
      rating: 4,
      recommendation: "pass",
      notes: "Solid interview.",
    });

    const otherOwner = await createOrganisation();
    expect(await listFeedbackForApplications(otherOwner.id, [application.id])).toEqual({});
  });

  it("returns an empty object for no application ids", async () => {
    const owner = await createOrganisation();
    expect(await listFeedbackForApplications(owner.id, [])).toEqual({});
  });
});
