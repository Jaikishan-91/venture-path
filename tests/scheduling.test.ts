import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import * as calendarLib from "@/lib/google-calendar";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { StageKind } from "@/lib/hiring/types";
import { utcToIndiaLocal } from "@/lib/hiring/time";
import {
  cancelScheduledEvent,
  listEventsForApplications,
  listUpcomingEventsForCandidate,
  rescheduleEvent,
  retryCalendarSync,
  scheduleEvent,
} from "@/lib/scheduling";

// Hoisted by Vitest above these imports, so `scheduling.ts` picks up the mocked module.
vi.mock("@/lib/google-calendar", () => ({
  isCalendarEnabled: vi.fn(),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  cancelCalendarEvent: vi.fn(),
}));

const isCalendarEnabledMock = vi.mocked(calendarLib.isCalendarEnabled);
const createCalendarEventMock = vi.mocked(calendarLib.createCalendarEvent);
const updateCalendarEventMock = vi.mocked(calendarLib.updateCalendarEvent);
const cancelCalendarEventMock = vi.mocked(calendarLib.cancelCalendarEvent);
const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

const EMAIL_DOMAIN = "scheduling-test.venturepath.local";

beforeEach(() => {
  sendEmailSpy.mockClear();
  createCalendarEventMock.mockReset();
  updateCalendarEventMock.mockReset();
  cancelCalendarEventMock.mockReset();
  isCalendarEnabledMock.mockReset();
  isCalendarEnabledMock.mockReturnValue(true);
  createCalendarEventMock.mockResolvedValue({
    ok: true,
    eventId: "g1",
    meetUrl: "https://meet.google.com/xyz",
    htmlLink: null,
  });
  updateCalendarEventMock.mockResolvedValue({
    ok: true,
    eventId: "g1",
    meetUrl: "https://meet.google.com/xyz",
    htmlLink: null,
  });
  cancelCalendarEventMock.mockResolvedValue({ ok: true });
});

function uniqueEmail(prefix = "person") {
  return `${prefix}-${randomUUID()}@${EMAIL_DOMAIN}`;
}

async function createOrganisation() {
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
      email: uniqueEmail("candidate"),
      role: "user",
      userProfile: {
        create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
}

async function createActiveMember(ownerId: string) {
  const org = await getDb().organisationProfile.findUniqueOrThrow({ where: { userId: ownerId } });
  const account = await getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Hiring manager",
      email: uniqueEmail("hm"),
      role: "hiring_manager",
    },
  });
  await getDb().organisationMember.create({
    data: {
      organisationProfileId: org.id,
      userId: account.id,
      email: account.email,
      name: account.name,
      status: "active",
      acceptedAt: new Date(),
    },
  });
  return account;
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

async function createStage(opportunityId: string, position: number, kind: StageKind = "interview") {
  return getDb().pipelineStage.create({
    data: {
      opportunityId,
      position,
      name: `Stage ${position}`,
      kind,
      instructions: null,
      externalUrl: null,
      durationMinutes: 30,
      source: "organisation",
    },
  });
}

async function createApplication(opportunityId: string, currentStageId: string | null) {
  const candidate = await createCandidate();
  const application = await getDb().application.create({
    data: {
      opportunityId,
      userProfileId: candidate.userProfile!.id,
      resumeFileName: "cv.pdf",
      resumeStorageKey: `${randomUUID()}.pdf`,
      currentStageId,
    },
  });
  return { application, candidate };
}

/** A future/past `datetime-local` value `days` away from now, in India time. */
const localIn = (days: number) =>
  utcToIndiaLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

describe("scheduleEvent", () => {
  it("creates the event and interviewers, and syncs to Calendar with a Meet link for an interview stage", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application } = await createApplication(opportunityId, stage.id);
    const hm = await createActiveMember(owner.id);

    const result = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [hm.id],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await settleBackground();

    const event = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: result.eventId },
      include: { interviewers: true },
    });
    expect(event.calendarSync).toBe("synced");
    expect(event.meetUrl).toBe("https://meet.google.com/xyz");
    expect(event.interviewers.map((i) => i.userId)).toEqual([hm.id]);
    expect(createCalendarEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ withMeet: true }),
    );
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("does not request a Meet link for a test stage and allows zero interviewers", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    const result = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 60,
      interviewerUserIds: [],
    });
    expect(result.ok).toBe(true);
    await settleBackground();
    expect(createCalendarEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ withMeet: false }),
    );
  });

  it("still creates the event and sends emails when Calendar is disabled", async () => {
    isCalendarEnabledMock.mockReturnValue(false);
    createCalendarEventMock.mockResolvedValue({ ok: false, reason: "disabled" });
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    const result = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await settleBackground();

    const event = await getDb().scheduledEvent.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(event.calendarSync).toBe("disabled");
    expect(event.meetUrl).toBeNull();
    expect(sendEmailSpy).toHaveBeenCalled();
  });

  it("marks calendarSync failed on a Calendar error, then retryCalendarSync succeeds", async () => {
    createCalendarEventMock.mockResolvedValueOnce({
      ok: false,
      reason: "http",
      message: "Backend error",
    });
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    const result = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await settleBackground();

    let event = await getDb().scheduledEvent.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(event.calendarSync).toBe("failed");
    expect(event.calendarError).toContain("Backend error");

    createCalendarEventMock.mockResolvedValueOnce({
      ok: true,
      eventId: "g2",
      meetUrl: null,
      htmlLink: null,
    });
    const retried = await retryCalendarSync(owner.id, result.eventId);
    expect(retried).toEqual({ ok: true, calendarSync: "synced" });
    event = await getDb().scheduledEvent.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(event.calendarSync).toBe("synced");
    expect(event.calendarError).toBeNull();
  });

  it("returns in_past for a time in the past", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    expect(
      await scheduleEvent(owner.id, {
        applicationId: application.id,
        stageId: stage.id,
        startsAtLocal: localIn(-2),
        durationMinutes: 30,
        interviewerUserIds: [],
      }),
    ).toEqual({ ok: false, reason: "in_past", message: "Choose a time in the future" });
  });

  it("returns wrong_stage when the candidate isn't at that stage", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage1 = await createStage(opportunityId, 0, "test");
    const stage2 = await createStage(opportunityId, 1, "test");
    const { application } = await createApplication(opportunityId, stage1.id);

    expect(
      await scheduleEvent(owner.id, {
        applicationId: application.id,
        stageId: stage2.id,
        startsAtLocal: localIn(2),
        durationMinutes: 30,
        interviewerUserIds: [],
      }),
    ).toEqual({ ok: false, reason: "wrong_stage" });
  });

  it("returns bad_interviewer for a deactivated HM, another org's HM, and a random user", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application } = await createApplication(opportunityId, stage.id);

    const deactivated = await createActiveMember(owner.id);
    await getDb().organisationMember.update({
      where: { userId: deactivated.id },
      data: { status: "deactivated", deactivatedAt: new Date() },
    });
    const otherOwner = await createOrganisation();
    const otherHm = await createActiveMember(otherOwner.id);
    const randomUser = await createCandidate();

    for (const badId of [deactivated.id, otherHm.id, randomUser.id]) {
      expect(
        await scheduleEvent(owner.id, {
          applicationId: application.id,
          stageId: stage.id,
          startsAtLocal: localIn(2),
          durationMinutes: 30,
          interviewerUserIds: [badId],
        }),
      ).toEqual({ ok: false, reason: "bad_interviewer" });
    }
  });

  it("refuses a second future event for the same application and stage", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    const first = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [],
    });
    expect(first.ok).toBe(true);

    const second = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(3),
      durationMinutes: 30,
      interviewerUserIds: [],
    });
    expect(second).toMatchObject({ ok: false, reason: "invalid" });
    if (!second.ok) expect(second.message).toMatch(/reschedule/i);
  });
});

describe("rescheduleEvent", () => {
  it("refuses a stale updatedAt, then updates time/duration/interviewers and notifies a removed interviewer", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application } = await createApplication(opportunityId, stage.id);
    const hm1 = await createActiveMember(owner.id);
    const hm2 = await createActiveMember(owner.id);

    const created = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [hm1.id],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await settleBackground();
    sendEmailSpy.mockClear();

    const before = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: created.eventId },
    });

    const stale = await rescheduleEvent(owner.id, created.eventId, {
      startsAtLocal: localIn(4),
      durationMinutes: 45,
      interviewerUserIds: [hm2.id],
      expectedUpdatedAt: new Date(0),
    });
    expect(stale).toEqual({ ok: false, reason: "stale" });

    updateCalendarEventMock.mockResolvedValueOnce({
      ok: true,
      eventId: "g1",
      meetUrl: "https://meet.google.com/updated",
      htmlLink: null,
    });
    const result = await rescheduleEvent(owner.id, created.eventId, {
      startsAtLocal: localIn(4),
      durationMinutes: 45,
      interviewerUserIds: [hm2.id],
      expectedUpdatedAt: before.updatedAt,
    });
    expect(result).toEqual({ ok: true });
    await settleBackground();

    expect(updateCalendarEventMock).toHaveBeenCalled();
    const interviewers = await getDb().eventInterviewer.findMany({
      where: { scheduledEventId: created.eventId },
    });
    expect(interviewers.map((i) => i.userId)).toEqual([hm2.id]);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: hm1.email, subject: expect.stringContaining("Removed") }),
    );
  });
});

describe("cancelScheduledEvent", () => {
  it("cancels the event, deletes the Calendar event, and sends cancellation emails", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "test");
    const { application } = await createApplication(opportunityId, stage.id);

    const created = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await settleBackground();
    sendEmailSpy.mockClear();

    const result = await cancelScheduledEvent(owner.id, created.eventId);
    expect(result).toEqual({ ok: true });
    await settleBackground();

    expect(cancelCalendarEventMock).toHaveBeenCalledWith("g1");
    const event = await getDb().scheduledEvent.findUniqueOrThrow({
      where: { id: created.eventId },
    });
    expect(event.status).toBe("cancelled");
    expect(sendEmailSpy).toHaveBeenCalled();
  });
});

describe("listEventsForApplications", () => {
  it("flags an interviewer who is no longer active", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application } = await createApplication(opportunityId, stage.id);
    const hm = await createActiveMember(owner.id);

    const created = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [hm.id],
    });
    expect(created.ok).toBe(true);
    await settleBackground();

    await getDb().organisationMember.update({
      where: { userId: hm.id },
      data: { status: "deactivated", deactivatedAt: new Date() },
    });

    const byApplication = await listEventsForApplications(owner.id, [application.id]);
    const events = byApplication.get(application.id);
    expect(events?.[0]?.interviewers).toEqual([{ userId: hm.id, name: hm.name, active: false }]);
  });
});

describe("listUpcomingEventsForCandidate", () => {
  it("returns only the candidate's own events, with no interviewer or feedback detail", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application: applicationA, candidate: candidateA } = await createApplication(
      opportunityId,
      stage.id,
    );
    const { application: applicationB } = await createApplication(opportunityId, stage.id);
    const hm = await createActiveMember(owner.id);

    const eventA = await scheduleEvent(owner.id, {
      applicationId: applicationA.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [hm.id],
    });
    await scheduleEvent(owner.id, {
      applicationId: applicationB.id,
      stageId: stage.id,
      startsAtLocal: localIn(3),
      durationMinutes: 30,
      interviewerUserIds: [hm.id],
    });
    expect(eventA.ok).toBe(true);
    await settleBackground();
    sendEmailSpy.mockClear();

    const events = await listUpcomingEventsForCandidate(candidateA.id);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("interviewers");
    expect(events[0]).not.toHaveProperty("feedback");
    expect(events[0]).not.toHaveProperty("score");
  });

  it("never puts the candidate's email in an interviewer's email", async () => {
    const owner = await createOrganisation();
    const opportunityId = await createListing(owner.id);
    const stage = await createStage(opportunityId, 0, "interview");
    const { application, candidate } = await createApplication(opportunityId, stage.id);
    const hm = await createActiveMember(owner.id);

    await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: stage.id,
      startsAtLocal: localIn(2),
      durationMinutes: 30,
      interviewerUserIds: [hm.id],
    });
    await settleBackground();

    const interviewerEmails = sendEmailSpy.mock.calls
      .map(([message]) => message)
      .filter((message) => message.to === hm.email);
    expect(interviewerEmails.length).toBeGreaterThan(0);
    for (const message of interviewerEmails) {
      expect(message.text).not.toContain(candidate.email);
    }
  });
});
