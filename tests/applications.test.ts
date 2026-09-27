import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { settleBackground } from "@/lib/background";
import {
  applyToOpportunity,
  decideApplication,
  getResumeForUser,
  withdrawApplication,
} from "@/lib/applications";
import { getDb } from "@/lib/db";
import { createOpportunity, changeOpportunityStatus } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";

const EMAIL_DOMAIN = "applications-test.venturepath.local";
const pdf = Buffer.from("%PDF-1.4\n");

async function createUser(role: "user" | "organisation", approved = true) {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: `Test ${role}`,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role,
      ...(role === "user"
        ? {
            userProfile: {
              create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
            },
          }
        : {
            organisationProfile: {
              create: {
                businessName: "Acme",
                description: "Tools",
                industry: "Manufacturing",
                location: "Pune",
                status: approved ? "approved" : "pending",
              },
            },
          }),
    },
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

async function publishedListing(organisationId: string) {
  const created = await createOpportunity(organisationId, listing);
  if (!created.ok) throw new Error(created.reason);
  await changeOpportunityStatus(organisationId, created.id, "publish");
  return created.id;
}

const resume = { fileName: "cv.pdf", extension: "pdf" as const, bytes: pdf };

let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "vp-resumes-"));
  process.env.UPLOAD_DIR = uploadDir;
});

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("applications", () => {
  it("applies once, withdraws, and applies again", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);

    const first = await applyToOpportunity(user.id, opportunityId, { ...resume, note: "Hello" });
    expect(first.ok).toBe(true);
    expect(await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "already_applied",
    });

    if (!first.ok) return;
    expect(await withdrawApplication(user.id, first.id)).toEqual({ ok: true });
    const again = await applyToOpportunity(user.id, opportunityId, { ...resume, note: "Again" });
    expect(again).toEqual({ ok: true, id: first.id });
  });

  it("refuses a closed listing and a user without a profile", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const bare = await getDb().user.create({
      data: {
        id: randomUUID(),
        name: "Bare",
        email: `${randomUUID()}@${EMAIL_DOMAIN}`,
        role: "user",
      },
    });
    const opportunityId = await publishedListing(organisation.id);
    await changeOpportunityStatus(organisation.id, opportunityId, "close");

    expect(await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "not_open",
    });
    expect(await applyToOpportunity(bare.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "needs_profile",
    });
  });

  it("lets only the user and the owning organisation read the resume, and only the organisation decide", async () => {
    const organisation = await createUser("organisation");
    const other = await createUser("organisation");
    const user = await createUser("user");
    const stranger = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);
    const applied = await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" });
    if (!applied.ok) throw new Error(applied.reason);

    expect(await getResumeForUser(user.id, applied.id)).not.toBeNull();
    expect(await getResumeForUser(organisation.id, applied.id)).not.toBeNull();
    expect(await getResumeForUser(stranger.id, applied.id)).toBeNull();
    expect(await decideApplication(other.id, applied.id, "accepted")).toEqual({
      ok: false,
      reason: "invalid_state",
    });
    expect(await decideApplication(organisation.id, applied.id, "accepted")).toEqual({ ok: true });
    expect(await withdrawApplication(user.id, applied.id)).toEqual({
      ok: false,
      reason: "invalid_state",
    });
  });

  it("cancels future scheduled events when an application is decided", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);
    const applied = await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" });
    if (!applied.ok) throw new Error("apply failed");

    const stage = await getDb().pipelineStage.create({
      data: {
        opportunityId,
        position: 0,
        name: "Screen",
        kind: "interview",
        source: "organisation",
      },
    });
    await getDb().application.update({
      where: { id: applied.id },
      data: { currentStageId: stage.id },
    });
    const event = await getDb().scheduledEvent.create({
      data: {
        applicationId: applied.id,
        stageId: stage.id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });

    expect(await decideApplication(organisation.id, applied.id, "rejected")).toEqual({ ok: true });
    await settleBackground();

    const cancelled = await getDb().scheduledEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(cancelled.status).toBe("cancelled");
  });
});
