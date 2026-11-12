import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { makeOffer, markNotSelected, respondToOffer, withdrawOffer } from "@/lib/offers";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { MAX_NOT_SELECTED_REASON_LENGTH, MAX_OFFER_MESSAGE_LENGTH } from "@/lib/v2/types";

// Integration tests: need the Docker Postgres from docker-compose.yml. Unique data only.
const EMAIL_DOMAIN = "offers-test.venturepath.local";
const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

beforeEach(() => {
  sendEmailSpy.mockClear();
});

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

const listing: OpportunityInput = {
  type: "internship",
  title: "Shop assistant",
  description: "Help run the shop.",
  skills: [],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 8000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: null,
  experienceLevel: null,
  compensationMin: null,
  compensationMax: null,
};

async function createOwner() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Offer owner",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Offer Sweets",
          description: "Sweets",
          industry: "Food",
          location: "Pune",
          status: "approved",
        },
      },
    },
  });
}

async function createStudent() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Offer student",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "COEP", course: "BBA", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
}

async function setup(stageCount = 0) {
  const owner = await createOwner();
  const result = await createOpportunity(owner.id, listing);
  if (!result.ok) throw new Error(result.reason);
  const opportunityId = result.id;
  const stages = [];
  for (let position = 0; position < stageCount; position++) {
    stages.push(
      await getDb().pipelineStage.create({
        data: {
          opportunityId,
          position,
          name: `Step ${position + 1}`,
          kind: "interview",
          durationMinutes: 30,
          source: "organisation",
        },
      }),
    );
  }
  const student = await createStudent();
  const application = await getDb().application.create({
    data: { opportunityId, userProfileId: student.userProfile!.id },
  });
  return { owner, student, opportunityId, stages, application };
}

const offer = { message: "Join us for the Diwali rush!", stipendInr: "9000", startDate: "" };
const reload = (id: string) => getDb().application.findUniqueOrThrow({ where: { id } });
const emailTo = (to: string, subject: string) =>
  sendEmailSpy.mock.calls.find(
    ([message]) => message.to === to && message.subject.includes(subject),
  )?.[0];

describe("makeOffer", () => {
  it("offers straight from Applied when the listing has no steps, and emails the student", async () => {
    const { owner, student, application } = await setup();
    const now = new Date("2026-11-12T06:00:00Z");

    expect(
      await makeOffer(owner.id, application.id, { ...offer, startDate: "2026-12-01" }, now),
    ).toEqual({ ok: true });
    await settleBackground();

    const row = await reload(application.id);
    expect(row).toMatchObject({
      status: "submitted",
      offerStatus: "pending",
      offerMessage: "Join us for the Diwali rush!",
      offerStipendInr: 9000,
      offeredById: owner.id,
    });
    expect(row.offerStartDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(row.offeredAt).toEqual(now);
    const email = emailTo(student.email, "Offer from Offer Sweets");
    expect(email?.text).toContain("Join us for the Diwali rush!");
    expect(email?.text).toContain("₹9,000 / month");
    expect(email?.text).toContain("/user/applications");

    // A second offer while one is pending is refused.
    expect(await makeOffer(owner.id, application.id, offer)).toEqual({
      ok: false,
      reason: "wrong_state",
    });
  });

  it("needs the candidate at the last step when the listing has steps", async () => {
    const { owner, application, stages } = await setup(2);

    expect(await makeOffer(owner.id, application.id, offer)).toEqual({
      ok: false,
      reason: "not_ready",
    });
    await getDb().application.update({
      where: { id: application.id },
      data: { currentStageId: stages[0].id },
    });
    expect(await makeOffer(owner.id, application.id, offer)).toEqual({
      ok: false,
      reason: "not_ready",
    });
    await getDb().application.update({
      where: { id: application.id },
      data: { currentStageId: stages[1].id },
    });
    expect(await makeOffer(owner.id, application.id, offer)).toEqual({ ok: true });
  });

  it("validates input and scopes to the owner", async () => {
    const { owner, application } = await setup();
    const other = await createOwner();
    const now = new Date("2026-11-12T06:00:00Z");

    expect(await makeOffer(other.id, application.id, offer)).toEqual({
      ok: false,
      reason: "not_found",
    });
    for (const bad of [
      { ...offer, message: "   " },
      { ...offer, message: "x".repeat(MAX_OFFER_MESSAGE_LENGTH + 1) },
      { ...offer, stipendInr: "-5" },
      { ...offer, stipendInr: "12.5" },
      { ...offer, startDate: "2026-02-30" },
      { ...offer, startDate: "2026-11-01" },
    ]) {
      expect(await makeOffer(owner.id, application.id, bad, now)).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    }
    expect((await reload(application.id)).offerStatus).toBeNull();
  });

  it("lets only one of two simultaneous offers win", async () => {
    const { owner, application } = await setup();
    const results = await Promise.all([
      makeOffer(owner.id, application.id, offer),
      makeOffer(owner.id, application.id, offer),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });
});

describe("respondToOffer", () => {
  it("accept hires the candidate through the decision path and emails both sides", async () => {
    const { owner, student, application, stages } = await setup(1);
    await getDb().application.update({
      where: { id: application.id },
      data: { currentStageId: stages[0].id },
    });
    const future = await getDb().scheduledEvent.create({
      data: {
        applicationId: application.id,
        stageId: stages[0].id,
        startsAt: new Date(Date.now() + 3_600_000),
        durationMinutes: 30,
      },
    });
    expect(await makeOffer(owner.id, application.id, offer)).toEqual({ ok: true });
    await settleBackground();
    sendEmailSpy.mockClear();

    const other = await createStudent();
    expect(await respondToOffer(other.id, application.id, "accept")).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await respondToOffer(student.id, application.id, "maybe")).toEqual({
      ok: false,
      reason: "invalid",
    });

    expect(await respondToOffer(student.id, application.id, "accept")).toEqual({
      ok: true,
      hired: true,
    });
    await settleBackground();

    const row = await reload(application.id);
    expect(row).toMatchObject({ status: "accepted", offerStatus: "accepted" });
    expect(row.decidedAt).not.toBeNull();
    expect(row.offerRespondedAt).not.toBeNull();
    expect(
      await getDb().stageEvent.findMany({ where: { applicationId: application.id } }),
    ).toMatchObject([{ stageId: stages[0].id, outcome: "passed", actorUserId: owner.id }]);
    expect(
      (await getDb().scheduledEvent.findUniqueOrThrow({ where: { id: future.id } })).status,
    ).toBe("cancelled");
    expect(emailTo(owner.email, "accepted your offer")?.text).toContain(student.email);
    expect(emailTo(student.email, "You're hired")?.text).toContain(owner.email);

    // Answering twice fails.
    expect(await respondToOffer(student.id, application.id, "decline")).toEqual({
      ok: false,
      reason: "wrong_state",
    });
  });

  it("decline keeps the candidate on the Offer tab; the owner can offer again or mark not selected", async () => {
    const { owner, student, application } = await setup();
    await makeOffer(owner.id, application.id, offer);
    await settleBackground();
    sendEmailSpy.mockClear();

    expect(await respondToOffer(student.id, application.id, "decline")).toEqual({
      ok: true,
      hired: false,
    });
    await settleBackground();
    expect(await reload(application.id)).toMatchObject({
      status: "submitted",
      offerStatus: "declined",
    });
    expect(emailTo(owner.email, "declined your offer")).toBeDefined();

    expect(
      await makeOffer(owner.id, application.id, { ...offer, message: "Better offer" }),
    ).toEqual({
      ok: true,
    });
    expect(await reload(application.id)).toMatchObject({
      offerStatus: "pending",
      offerMessage: "Better offer",
      offerRespondedAt: null,
    });
  });

  it("only one of two simultaneous answers wins", async () => {
    const { owner, student, application } = await setup();
    await makeOffer(owner.id, application.id, offer);
    const results = await Promise.all([
      respondToOffer(student.id, application.id, "accept"),
      respondToOffer(student.id, application.id, "decline"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    await settleBackground();
  });
});

describe("withdrawOffer and markNotSelected", () => {
  it("withdraws a pending offer; the student can no longer answer it", async () => {
    const { owner, student, application } = await setup();
    await makeOffer(owner.id, application.id, offer);

    expect(await withdrawOffer((await createOwner()).id, application.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await withdrawOffer(owner.id, application.id)).toEqual({ ok: true });
    expect((await reload(application.id)).offerStatus).toBe("withdrawn");
    expect(await withdrawOffer(owner.id, application.id)).toEqual({
      ok: false,
      reason: "wrong_state",
    });
    expect(await respondToOffer(student.id, application.id, "accept")).toEqual({
      ok: false,
      reason: "wrong_state",
    });
    await settleBackground();
  });

  it("refuses Not selected while an offer is pending, then sends the kind reason", async () => {
    const { owner, student, application } = await setup();
    await makeOffer(owner.id, application.id, offer);
    expect(await markNotSelected(owner.id, application.id, null, "")).toEqual({
      ok: false,
      reason: "wrong_state",
    });
    await withdrawOffer(owner.id, application.id);
    await settleBackground();
    sendEmailSpy.mockClear();

    expect(
      await markNotSelected(
        owner.id,
        application.id,
        null,
        "x".repeat(MAX_NOT_SELECTED_REASON_LENGTH + 1),
      ),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(await markNotSelected(owner.id, application.id, null, "Thanks — keep going!")).toEqual({
      ok: true,
    });
    await settleBackground();
    expect(await reload(application.id)).toMatchObject({
      status: "rejected",
      notSelectedReason: "Thanks — keep going!",
    });
    expect(emailTo(student.email, "Application update")?.text).toContain("Thanks — keep going!");
  });
});
