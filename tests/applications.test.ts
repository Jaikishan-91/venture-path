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
  listApplicants,
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

async function publishedListing(organisationId: string, applyTask: string | null = null) {
  const created = await createOpportunity(organisationId, { ...listing, applyTask });
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

/** A manual proof card owned by `userId`, written directly (no background check). */
async function proofFor(userId: string, title = "Shop posts") {
  const profile = await getDb().userProfile.findUniqueOrThrow({ where: { userId } });
  return getDb().proof.create({
    data: {
      userProfileId: profile.id,
      title,
      whatIDid: "Wrote 30 posts in Canva.",
      link: "https://example.com/posts",
      skills: ["canva"],
      level: "checked",
    },
  });
}

const attachedProofIds = async (applicationId: string) =>
  (
    await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { proofs: { select: { id: true } } },
    })
  ).proofs
    .map((proof) => proof.id)
    .sort();

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

describe("applying with proof (Module 4)", () => {
  it("applies with proof cards only and shows them to the organisation", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);
    const proof = await proofFor(user.id);

    const applied = await applyToOpportunity(user.id, opportunityId, {
      note: "",
      proofIds: [proof.id, proof.id],
    });
    if (!applied.ok) throw new Error(applied.reason);
    await settleBackground();

    const row = await getDb().application.findUniqueOrThrow({ where: { id: applied.id } });
    expect(row.resumeStorageKey).toBeNull();
    expect(row.resumeFileName).toBeNull();
    expect(await attachedProofIds(applied.id)).toEqual([proof.id]);
    expect(await getResumeForUser(user.id, applied.id)).toMatchObject({ resumeStorageKey: null });

    const { applicants } = await listApplicants(organisation.id, opportunityId);
    expect(applicants[0].proofs).toEqual([
      expect.objectContaining({ id: proof.id, title: "Shop posts", level: "checked" }),
    ]);
    expect(applicants[0].proofs[0]).not.toHaveProperty("aiScore");
  });

  it("needs a proof card or a resume, and only the applicant's own cards", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const other = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);
    const theirs = await proofFor(other.id);

    expect(await applyToOpportunity(user.id, opportunityId, { note: "" })).toEqual({
      ok: false,
      reason: "needs_evidence",
    });
    expect(
      await applyToOpportunity(user.id, opportunityId, { note: "", proofIds: [theirs.id] }),
    ).toEqual({ ok: false, reason: "proof_not_found" });
    const mine = await Promise.all([1, 2, 3, 4].map((i) => proofFor(user.id, `Proof ${i}`)));
    expect(
      await applyToOpportunity(user.id, opportunityId, {
        note: "",
        proofIds: mine.map((proof) => proof.id),
      }),
    ).toEqual({ ok: false, reason: "proof_not_found" });
    // A resume alone still works.
    expect(await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" })).toMatchObject(
      { ok: true },
    );
  });

  it("replaces the attached proof cards when resubmitting", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const opportunityId = await publishedListing(organisation.id);
    const [first, second] = [await proofFor(user.id, "One"), await proofFor(user.id, "Two")];

    const applied = await applyToOpportunity(user.id, opportunityId, {
      ...resume,
      note: "",
      proofIds: [first.id],
    });
    if (!applied.ok) throw new Error(applied.reason);
    expect(await withdrawApplication(user.id, applied.id)).toEqual({ ok: true });
    expect(
      await applyToOpportunity(user.id, opportunityId, { note: "", proofIds: [second.id] }),
    ).toEqual({ ok: true, id: applied.id });
    expect(await attachedProofIds(applied.id)).toEqual([second.id]);
    const row = await getDb().application.findUniqueOrThrow({ where: { id: applied.id } });
    expect(row.resumeStorageKey).toBeNull();
    await settleBackground();
  });

  it("requires the apply task answer and saves it as an attached proof card", async () => {
    const organisation = await createUser("organisation");
    const user = await createUser("user");
    const opportunityId = await publishedListing(organisation.id, "Write 3 captions.");

    expect(await applyToOpportunity(user.id, opportunityId, { ...resume, note: "" })).toEqual({
      ok: false,
      reason: "task_required",
    });
    const applied = await applyToOpportunity(user.id, opportunityId, {
      note: "",
      taskAnswer: "  1. Sweet! 2. Sweeter! 3. Sweetest!  ",
    });
    if (!applied.ok) throw new Error(applied.reason);

    const taskProofs = await getDb().proof.findMany({
      where: { source: "apply_task", applications: { some: { id: applied.id } } },
    });
    expect(taskProofs).toHaveLength(1);
    expect(taskProofs[0]).toMatchObject({
      title: "Task: Marketing intern",
      whatIDid: "1. Sweet! 2. Sweeter! 3. Sweetest!",
      level: "added",
      aiScoreStatus: "skipped",
    });

    // Resubmitting updates the same task card instead of adding another.
    expect(await withdrawApplication(user.id, applied.id)).toEqual({ ok: true });
    const again = await applyToOpportunity(user.id, opportunityId, {
      note: "",
      taskAnswer: "New captions",
    });
    expect(again).toEqual({ ok: true, id: applied.id });
    const after = await getDb().proof.findMany({
      where: { source: "apply_task", userProfile: { userId: user.id } },
    });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: taskProofs[0].id, whatIDid: "New captions" });
    expect(await attachedProofIds(applied.id)).toEqual([taskProofs[0].id]);
    await settleBackground();
  });
});
