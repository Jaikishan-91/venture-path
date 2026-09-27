import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import {
  canHiringManagerReadResume,
  feedbackDisabledReason,
  getAssignedEvent,
  getApplicationResumeFile,
  listAssignedEvents,
} from "@/lib/hm-interviews";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { acceptInvite, deactivateMember, getActiveMembership, inviteMember } from "@/lib/team";

// Integration tests: need the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "hm-interviews-test.venturepath.local";

const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

beforeEach(() => {
  sendEmailSpy.mockClear();
});

function uniqueEmail(prefix = "person") {
  return `${prefix}-${randomUUID()}@${EMAIL_DOMAIN}`;
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
        create: { institution: "IIT Bombay", course: "CSE", graduationYear: 2027, skills: [] },
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
  const result = await createOpportunity(ownerUserId, listing, [
    { prompt: "Why this role?", source: "organisation" },
  ]);
  if (!result.ok) throw new Error(result.reason);
  return getDb().opportunity.findUniqueOrThrow({
    where: { id: result.id },
    include: { questions: true },
  });
}

async function createStage(opportunityId: string) {
  return getDb().pipelineStage.create({
    data: {
      opportunityId,
      position: 0,
      name: "Interview 1",
      kind: "interview",
      instructions: "Bring a laptop.",
      source: "organisation",
    },
  });
}

async function createApplication(
  opportunityId: string,
  userProfileId: string,
  currentStageId: string,
  questionId: string,
) {
  return getDb().application.create({
    data: {
      opportunityId,
      userProfileId,
      currentStageId,
      resumeFileName: "resume.pdf",
      resumeStorageKey: `${randomUUID()}.pdf`,
      answers: { create: [{ questionId, answer: "Because I love marketing." }] },
    },
  });
}

async function createHiringManager(orgOwnerUserId: string, name = "Test HM") {
  const email = uniqueEmail("hm");
  const { memberId } = unwrap(await inviteMember(orgOwnerUserId, { name, email }));
  await settleBackground();
  const call = sendEmailSpy.mock.calls.find((c) => c[0].to === email);
  const match = call?.[0].text.match(/\/invite\/(\S+)/);
  if (!match) throw new Error("invite email not found");
  const account = await getDb().user.create({
    data: { id: randomUUID(), name, email, role: null },
  });
  unwrap(await acceptInvite(match[1], account.id));
  return { account, memberId };
}

function unwrap<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got failure: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

async function createScheduledEvent(
  applicationId: string,
  stageId: string,
  interviewerUserIds: string[],
  overrides: { startsAt?: Date; durationMinutes?: number; status?: "scheduled" | "cancelled" } = {},
) {
  return getDb().scheduledEvent.create({
    data: {
      applicationId,
      stageId,
      startsAt: overrides.startsAt ?? new Date(Date.now() + 60 * 60 * 1000),
      durationMinutes: overrides.durationMinutes ?? 30,
      status: overrides.status ?? "scheduled",
      interviewers: { create: interviewerUserIds.map((userId) => ({ userId })) },
    },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("listAssignedEvents / getAssignedEvent (D4)", () => {
  it("an assigned HM sees the event; an unassigned HM of the same org does not", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const { account: assignedHm } = await createHiringManager(owner.id, "Assigned HM");
    const { account: otherHm } = await createHiringManager(owner.id, "Other HM");
    const event = await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    const assignedList = await listAssignedEvents(assignedHm.id, orgId, { scope: "all" });
    expect(assignedList.map((e) => e.id)).toEqual([event.id]);
    expect(await getAssignedEvent(assignedHm.id, orgId, event.id)).not.toBeNull();

    const unassignedList = await listAssignedEvents(otherHm.id, orgId, { scope: "all" });
    expect(unassignedList).toEqual([]);
    expect(await getAssignedEvent(otherHm.id, orgId, event.id)).toBeNull();
  });

  it("an HM of another organisation never sees the event, even by id", async () => {
    const owner = await createOrganisation();
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const { account: assignedHm } = await createHiringManager(owner.id, "Assigned HM");
    const event = await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    const otherOwner = await createOrganisation();
    const otherOrgId = otherOwner.organisationProfile!.id;
    const { account: otherOrgHm } = await createHiringManager(otherOwner.id, "Other org HM");

    expect(await listAssignedEvents(otherOrgHm.id, otherOrgId, { scope: "all" })).toEqual([]);
    expect(await getAssignedEvent(otherOrgHm.id, otherOrgId, event.id)).toBeNull();
  });

  it("a genuine interviewer is invisible when the org id passed doesn't match the event's org (membership moved)", async () => {
    const owner = await createOrganisation();
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const { account: assignedHm } = await createHiringManager(owner.id, "Assigned HM");
    const event = await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    const otherOwner = await createOrganisation();
    const otherOrgId = otherOwner.organisationProfile!.id;

    // Same interviewer row, but the org id supplied (as if their active membership were now
    // elsewhere) doesn't match the event's own organisation: D4's org check still applies.
    expect(await listAssignedEvents(assignedHm.id, otherOrgId, { scope: "all" })).toEqual([]);
    expect(await getAssignedEvent(assignedHm.id, otherOrgId, event.id)).toBeNull();
  });

  it("a deactivated HM's membership is not active; hm-interviews itself trusts the caller's org id", async () => {
    // `requireActiveHiringManager()` is what keeps a deactivated HM out: it calls
    // `getActiveMembership` and redirects before any organisationProfileId reaches this module.
    // `hm-interviews.ts` does not re-check membership status itself (D4 takes the caller's
    // ACTIVE org id as given), so this test documents the boundary rather than exercising it here.
    const owner = await createOrganisation();
    const { account: hm, memberId } = await createHiringManager(owner.id, "Soon deactivated");
    unwrap(await deactivateMember(owner.id, memberId));
    expect(await getActiveMembership(hm.id)).toBeNull();
  });

  it("splits upcoming (ascending, non-cancelled) from past (descending, includes cancelled)", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const { account: hm } = await createHiringManager(owner.id);

    const candidateA = await createCandidate("Candidate A");
    const appA = await createApplication(
      listingRow.id,
      candidateA.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const future = await createScheduledEvent(appA.id, stage.id, [hm.id], {
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    const candidateB = await createCandidate("Candidate B");
    const appB = await createApplication(
      listingRow.id,
      candidateB.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const past = await createScheduledEvent(appB.id, stage.id, [hm.id], {
      startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const candidateC = await createCandidate("Candidate C");
    const appC = await createApplication(
      listingRow.id,
      candidateC.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    // Cancelled but still in the future: counted as past, never upcoming.
    const cancelledFuture = await createScheduledEvent(appC.id, stage.id, [hm.id], {
      startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      status: "cancelled",
    });

    const upcoming = await listAssignedEvents(hm.id, orgId, { scope: "upcoming" });
    expect(upcoming.map((e) => e.id)).toEqual([future.id]);

    const pastEvents = await listAssignedEvents(hm.id, orgId, { scope: "past" });
    const pastIds = pastEvents.map((e) => e.id);
    expect(pastIds).toContain(past.id);
    expect(pastIds).toContain(cancelledFuture.id);
    expect(pastIds).not.toContain(future.id);
    // Descending by start time: the cancelled-but-future event sorts before the truly past one.
    expect(pastIds.indexOf(cancelledFuture.id)).toBeLessThan(pastIds.indexOf(past.id));
  });

  it("never returns the candidate's email or any AI analysis score", async () => {
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    await getDb().analysis.create({
      data: {
        applicationId: application.id,
        resumeScore: 91,
        overallScore: 87,
        summary: "AI-SUMMARY-MARKER",
      },
    });
    await getDb().applicationAnswer.updateMany({
      where: { applicationId: application.id },
      data: { score: 77, feedback: "AI-ANSWER-FEEDBACK-MARKER" },
    });
    const { account: hm } = await createHiringManager(owner.id);
    const event = await createScheduledEvent(application.id, stage.id, [hm.id]);

    const detail = await getAssignedEvent(hm.id, orgId, event.id);
    expect(detail).not.toBeNull();
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain(candidate.email);
    expect(serialized).not.toContain("AI-SUMMARY-MARKER");
    expect(serialized).not.toContain("AI-ANSWER-FEEDBACK-MARKER");
    expect(detail).not.toHaveProperty("resumeScore");
    expect(detail).not.toHaveProperty("overallScore");
    expect(serialized).not.toMatch(/"score"|"feedback":"AI/);
    expect(detail!.candidateName).toBe(candidate.name);
    expect(detail!.screeningAnswers).toEqual([
      { prompt: "Why this role?", answer: "Because I love marketing." },
    ]);
  });
});

describe("canHiringManagerReadResume", () => {
  it("true when assigned to a non-cancelled event; false when unassigned, cancelled-only, or another org", async () => {
    const owner = await createOrganisation();
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    const { account: assignedHm } = await createHiringManager(owner.id, "Assigned");
    const { account: unassignedHm } = await createHiringManager(owner.id, "Unassigned");
    await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    expect(await canHiringManagerReadResume(assignedHm.id, application.id)).toBe(true);
    expect(await canHiringManagerReadResume(unassignedHm.id, application.id)).toBe(false);

    const otherOwner = await createOrganisation();
    const { account: otherOrgHm } = await createHiringManager(otherOwner.id, "Other org");
    expect(await canHiringManagerReadResume(otherOrgHm.id, application.id)).toBe(false);

    // A cancelled-only assignment doesn't grant resume access.
    const candidate2 = await createCandidate("Candidate two");
    const application2 = await createApplication(
      listingRow.id,
      candidate2.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    await createScheduledEvent(application2.id, stage.id, [assignedHm.id], { status: "cancelled" });
    expect(await canHiringManagerReadResume(assignedHm.id, application2.id)).toBe(false);
  });
});

describe("getApplicationResumeFile", () => {
  it("returns the stored file name and key for a known application", async () => {
    const owner = await createOrganisation();
    const listingRow = await createListing(owner.id);
    const stage = await createStage(listingRow.id);
    const candidate = await createCandidate();
    const application = await createApplication(
      listingRow.id,
      candidate.userProfile!.id,
      stage.id,
      listingRow.questions[0].id,
    );
    expect(await getApplicationResumeFile(application.id)).toEqual({
      resumeFileName: "resume.pdf",
      resumeStorageKey: application.resumeStorageKey,
    });
    expect(await getApplicationResumeFile(randomUUID())).toBeNull();
  });
});

describe("feedbackDisabledReason", () => {
  it("disables for a cancelled event, or before the event starts; otherwise enabled", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(
      feedbackDisabledReason(
        { status: "cancelled", startsAt: new Date("2026-09-01T00:00:00Z") },
        now,
      ),
    ).toContain("cancelled");
    expect(
      feedbackDisabledReason(
        { status: "scheduled", startsAt: new Date("2026-10-02T00:00:00Z") },
        now,
      ),
    ).toContain("once the interview starts");
    expect(
      feedbackDisabledReason(
        { status: "scheduled", startsAt: new Date("2026-09-01T00:00:00Z") },
        now,
      ),
    ).toBeNull();
  });
});
