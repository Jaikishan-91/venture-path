import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getHiringManagerDashboard } from "@/lib/dashboard/hiring-manager";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { acceptInvite, inviteMember } from "@/lib/team";

// Integration test: needs the Docker Postgres from docker-compose.yml. The test database is
// shared by files running in parallel, so assertions are scoped to this test's own fixtures.
const EMAIL_DOMAIN = "dashboard-hiring-manager-test.venturepath.local";

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
  startsAt: Date,
  status: "scheduled" | "cancelled" = "scheduled",
) {
  return getDb().scheduledEvent.create({
    data: {
      applicationId,
      stageId,
      startsAt,
      durationMinutes: 30,
      status,
      interviewers: { create: interviewerUserIds.map((userId) => ({ userId })) },
    },
  });
}

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("getHiringManagerDashboard", () => {
  it("counts today, the next 7 days, feedback awaiting and submitted, scoped to this HM", async () => {
    const now = new Date("2026-10-05T04:00:00Z"); // 09:30 IST, same India date
    const owner = await createOrganisation();
    const orgId = owner.organisationProfile!.id;
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const hm = await createHiringManager(owner.id);

    const candidateToday = await createCandidate("Today Candidate");
    const appToday = await createApplication(listingId, candidateToday.userProfile!.id, stage.id);
    const today = await createScheduledEvent(
      appToday.id,
      stage.id,
      [hm.id],
      new Date("2026-10-05T06:00:00Z"), // later today, India time
    );

    const candidateWeek = await createCandidate("This Week Candidate");
    const appWeek = await createApplication(listingId, candidateWeek.userProfile!.id, stage.id);
    const thisWeek = await createScheduledEvent(
      appWeek.id,
      stage.id,
      [hm.id],
      new Date("2026-10-08T04:00:00Z"), // 3 days later, still within 7 days
    );

    const candidateAwaiting = await createCandidate("Awaiting Feedback Candidate");
    const appAwaiting = await createApplication(
      listingId,
      candidateAwaiting.userProfile!.id,
      stage.id,
    );
    const awaiting = await createScheduledEvent(
      appAwaiting.id,
      stage.id,
      [hm.id],
      new Date("2026-10-01T04:00:00Z"), // past, no feedback yet
    );

    const candidateDone = await createCandidate("Feedback Done Candidate");
    const appDone = await createApplication(listingId, candidateDone.userProfile!.id, stage.id);
    const done = await createScheduledEvent(
      appDone.id,
      stage.id,
      [hm.id],
      new Date("2026-09-30T04:00:00Z"), // past, feedback already submitted
    );
    await getDb().interviewFeedback.create({
      data: {
        scheduledEventId: done.id,
        interviewerUserId: hm.id,
        rating: 5,
        recommendation: "pass",
        notes: "Great candidate.",
      },
    });

    const candidateCancelled = await createCandidate("Cancelled Candidate");
    const appCancelled = await createApplication(
      listingId,
      candidateCancelled.userProfile!.id,
      stage.id,
    );
    await createScheduledEvent(
      appCancelled.id,
      stage.id,
      [hm.id],
      new Date("2026-10-06T04:00:00Z"),
      "cancelled",
    );

    const dashboard = await getHiringManagerDashboard(hm.id, orgId, now);

    expect(dashboard.counts).toEqual({
      today: 1,
      upcomingWeek: 2,
      awaitingFeedback: 1,
      feedbackSubmitted: 1,
    });
    expect(dashboard.nextEvents.map((e) => e.id)).toEqual([today.id, thisWeek.id]);
    expect(dashboard.awaitingFeedbackEvents.map((e) => e.id)).toEqual([awaiting.id]);
  });

  it("scopes counts to the caller's own organisation", async () => {
    const now = new Date("2026-10-05T04:00:00Z");
    const owner = await createOrganisation();
    const hm = await createHiringManager(owner.id);

    const otherOwner = await createOrganisation();
    const otherOrgId = otherOwner.organisationProfile!.id;

    const dashboard = await getHiringManagerDashboard(hm.id, otherOrgId, now);
    expect(dashboard.counts).toEqual({
      today: 0,
      upcomingWeek: 0,
      awaitingFeedback: 0,
      feedbackSubmitted: 0,
    });
    expect(dashboard.nextEvents).toEqual([]);
    expect(dashboard.awaitingFeedbackEvents).toEqual([]);
  });
});
