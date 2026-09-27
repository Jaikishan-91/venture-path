import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { canHiringManagerReadResume } from "@/lib/hm-interviews";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { acceptInvite, inviteMember } from "@/lib/team";

// Integration test for the access check behind `GET /api/applications/[id]/resume` (WP5): the
// route keeps its existing applicant/organisation-owner access and adds this for hiring managers.
// Needs the Docker Postgres from docker-compose.yml.
const EMAIL_DOMAIN = "resume-access-test.venturepath.local";

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

async function createCandidate() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Real Candidate",
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
  status: "scheduled" | "cancelled" = "scheduled",
) {
  return getDb().scheduledEvent.create({
    data: {
      applicationId,
      stageId,
      startsAt: new Date(),
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

describe("canHiringManagerReadResume", () => {
  it("is true for an HM assigned to a non-cancelled event on the application", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    await createScheduledEvent(application.id, stage.id, [hm.id]);

    expect(await canHiringManagerReadResume(hm.id, application.id)).toBe(true);
  });

  it("is false for an HM of the same org who isn't assigned to any event on the application", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const assignedHm = await createHiringManager(owner.id, "Assigned");
    const unassignedHm = await createHiringManager(owner.id, "Unassigned");
    await createScheduledEvent(application.id, stage.id, [assignedHm.id]);

    expect(await canHiringManagerReadResume(unassignedHm.id, application.id)).toBe(false);
  });

  it("is false when the HM's only event on the application is cancelled", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    const hm = await createHiringManager(owner.id);
    await createScheduledEvent(application.id, stage.id, [hm.id], "cancelled");

    expect(await canHiringManagerReadResume(hm.id, application.id)).toBe(false);
  });

  it("is false for an HM of a different organisation", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);
    await createScheduledEvent(application.id, stage.id, []);

    const otherOwner = await createOrganisation();
    const otherOrgHm = await createHiringManager(otherOwner.id, "Other org HM");

    expect(await canHiringManagerReadResume(otherOrgHm.id, application.id)).toBe(false);
  });

  it("is false for an account with no active membership at all", async () => {
    const owner = await createOrganisation();
    const listingId = await createListing(owner.id);
    const stage = await createStage(listingId);
    const candidate = await createCandidate();
    const application = await createApplication(listingId, candidate.userProfile!.id, stage.id);

    const stranger = await getDb().user.create({
      data: { id: randomUUID(), name: "Stranger", email: uniqueEmail("stranger"), role: null },
    });
    expect(await canHiringManagerReadResume(stranger.id, application.id)).toBe(false);
  });
});
