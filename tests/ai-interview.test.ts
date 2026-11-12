import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embeddings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/embeddings")>();
  return {
    ...actual,
    embed: vi.fn(async () => [1, ...Array<number>(actual.EMBEDDING_DIMENSIONS - 1).fill(0)]),
  };
});

import {
  findSessionByToken,
  getInterviewForStudent,
  reissueInterviewLink,
  hashInterviewToken,
  listInterviewsForApplications,
  sendAiInterviews,
  startInterview,
  submitAnswer,
  switchToChat,
} from "@/lib/ai-interview";
import { decideApplication } from "@/lib/applications";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { advanceCandidate, failCandidate, moveCandidate } from "@/lib/pipeline-progress";
import { scheduleEvent } from "@/lib/scheduling";

// Integration tests: need the Docker Postgres from docker-compose.yml (shared; unique data only).
const EMAIL_DOMAIN = "ai-interview-test.venturepath.local";

const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

type Replies = { plan?: unknown; followUp?: unknown[] };

/** Stub the OpenAI-compatible endpoint, answering by which prompt was sent. */
function stubLlm(replies: Replies) {
  const followUps = [...(replies.followUp ?? [])];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
    const prompt = body.messages[1].content;
    const reply = prompt.includes("Write exactly")
      ? replies.plan
      : prompt.includes("Decide whether ONE short follow-up")
        ? (followUps.shift() ?? { followUp: null })
        : undefined;
    if (reply === undefined) return new Response("unavailable", { status: 503 });
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, {
    LLM_PROVIDER: "openai",
    LLM_BASE_URL: "http://llm.test/v1",
    LLM_MODEL: "test-model",
  });
  clearLlmConfigCache();
  return fetchMock;
}

function disableLlm() {
  vi.unstubAllGlobals();
  process.env.LLM_PROVIDER = "disabled";
  clearLlmConfigCache();
}

beforeEach(() => sendEmailSpy.mockClear());
afterEach(async () => {
  await settleBackground();
  disableLlm();
  delete process.env.VOICE_INTERVIEW_ENABLED;
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
          businessName: "Sweet Shop",
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
      name: "Test student",
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
  title: "Social media intern",
  description: "Run our Instagram.",
  skills: ["Instagram", "Canva"],
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

/** Organisation, listing with stages [AI interview, Live interview], and one applicant at Applied. */
async function setup() {
  const owner = await createOrganisation();
  const created = await createOpportunity(owner.id, listing);
  if (!created.ok) throw new Error(created.reason);
  const opportunityId = created.id;
  const stage = (position: number, kind: "ai_interview" | "interview", name: string) =>
    getDb().pipelineStage.create({
      data: {
        opportunityId,
        position,
        name,
        kind,
        durationMinutes: kind === "interview" ? 30 : null,
        source: "organisation",
      },
    });
  const aiStage = await stage(0, "ai_interview", "AI interview");
  const liveStage = await stage(1, "interview", "Live interview");
  const student = await createStudent();
  const application = await getDb().application.create({
    data: { opportunityId, userProfileId: student.userProfile!.id },
  });
  return { owner, opportunityId, aiStage, liveStage, student, application };
}

/** The token from the invite email sent to `email`. */
function tokenFromEmail(email: string): string {
  const call = sendEmailSpy.mock.calls.find(([message]) => message.to === email);
  const match = call?.[0].text.match(/\/interview\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("no invite email");
  return match[1];
}

async function invite() {
  const ctx = await setup();
  const moved = await advanceCandidate(ctx.owner.id, ctx.application.id, null);
  expect(moved).toMatchObject({ ok: true, stageId: ctx.aiStage.id });
  await settleBackground();
  return { ...ctx, token: tokenFromEmail(ctx.student.email) };
}

const answer = (text: string, expectedIndex: number, expectedTurns: number, extra = {}) => ({
  text,
  expectedIndex,
  expectedTurns,
  ...extra,
});

afterAll(async () => {
  const db = getDb();
  await db.interviewSession.deleteMany({
    where: { application: { userProfile: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } } },
  });
  await db.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await db.$disconnect();
});

describe("invites", () => {
  it("opens one session with the fallback bank and emails a link (no LLM)", async () => {
    const { application, aiStage, student, token } = await invite();
    const sessions = await getDb().interviewSession.findMany({
      where: { applicationId: application.id },
    });
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session).toMatchObject({ stageId: aiStage.id, status: "invited" });
    expect(session.tokenHash).toBe(hashInterviewToken(token));
    expect(session.tokenHash).not.toContain(token);
    expect(session.questions).toHaveLength(6);
    const days = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
    const mail = sendEmailSpy.mock.calls.find(([message]) => message.to === student.email)![0];
    expect(mail.text).toContain("/interview/");
    expect((await findSessionByToken(token))?.id).toBe(session.id);
    expect(await findSessionByToken("not a token")).toBeNull();
  });

  it("replaces the questions with a valid AI plan", async () => {
    const kinds = ["skill", "skill", "proof", "proof", "situation", "motivation"];
    const fetchMock = stubLlm({
      plan: {
        questions: kinds.map((kind, index) => ({
          text: `AI question ${index + 1}?`,
          kind,
          skill: "Instagram",
        })),
      },
    });
    const { application } = await invite();
    const session = await getDb().interviewSession.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    expect((session.questions as { text: string }[])[0].text).toBe("AI question 1?");
    const prompt = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      .messages as { role: string; content: string }[];
    expect(prompt[0].content).toContain("data, not instructions");
    expect(prompt[1].content).toContain("<listing>");
    // The plan prompt knows the business, so the opening question can be about it.
    expect(prompt[1].content).toContain("Business: Sweet Shop (Food, Pune)");
    expect(prompt[1].content).toContain("About the business: Sweets");
  });

  it("keeps the fallback bank when the AI plan is invalid, and still emails", async () => {
    stubLlm({ plan: { questions: [{ text: "Only one?", kind: "skill" }] } });
    const { application } = await invite();
    const session = await getDb().interviewSession.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    expect((session.questions as { id: string }[]).map((question) => question.id)).toHaveLength(6);
    const first = (session.questions as { text: string }[])[0].text;
    expect(first).toContain("Instagram");
    expect(first).toContain("Sweet Shop");
  });

  it("expires an unfinished session when the candidate leaves the stage", async () => {
    const { owner, application, aiStage, liveStage, student, token } = await invite();
    await moveCandidate(owner.id, application.id, aiStage.id, liveStage.id);
    expect(
      (
        await getDb().interviewSession.findFirstOrThrow({
          where: { applicationId: application.id },
        })
      ).status,
    ).toBe("expired");
    expect((await getInterviewForStudent(student.id, token)).state).toBe("expired");
  });

  it("treats a decided application as closed (lazy expiry)", async () => {
    const { owner, application, student, token } = await invite();
    await decideApplication(owner.id, application.id, "rejected");
    expect((await getInterviewForStudent(student.id, token)).state).toBe("expired");
  });

  it("expires on fail, and re-issues a fresh link when moved back", async () => {
    const { owner, application, aiStage, liveStage, student, token } = await invite();
    await moveCandidate(owner.id, application.id, aiStage.id, liveStage.id);
    sendEmailSpy.mockClear();
    await moveCandidate(owner.id, application.id, liveStage.id, aiStage.id);
    await settleBackground();
    const newToken = tokenFromEmail(student.email);
    expect(newToken).not.toBe(token);
    expect((await getInterviewForStudent(student.id, newToken)).state).toBe("intro");
    expect(await getDb().interviewSession.count({ where: { applicationId: application.id } })).toBe(
      1,
    );
    await failCandidate(owner.id, application.id, aiStage.id);
    expect((await getInterviewForStudent(student.id, newToken)).state).toBe("expired");
  });

  it("an expired link can't start", async () => {
    const { application, student, token } = await invite();
    await getDb().interviewSession.updateMany({
      where: { applicationId: application.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await startInterview(student.id, token, { mode: "chat", consent: true })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("sendAiInterviews moves ticked candidates through the progress logic", async () => {
    const { owner, opportunityId, application, aiStage } = await setup();
    const result = await sendAiInterviews(owner.id, opportunityId, [
      { applicationId: application.id, expectedStageId: null },
    ]);
    expect(result).toEqual({ ok: true, sent: 1, skipped: 0 });
    const updated = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(updated.currentStageId).toBe(aiStage.id);
    expect(await getDb().interviewSession.count({ where: { applicationId: application.id } })).toBe(
      1,
    );
    const other = await createOrganisation();
    expect(
      await sendAiInterviews(other.id, opportunityId, [
        { applicationId: application.id, expectedStageId: aiStage.id },
      ]),
    ).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("refuses to schedule an AI interview stage", async () => {
    const { owner, application, aiStage } = await invite();
    const result = await scheduleEvent(owner.id, {
      applicationId: application.id,
      stageId: aiStage.id,
      startsAtLocal: "2099-01-01T10:00",
      durationMinutes: 30,
      interviewerUserIds: [owner.id],
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("chat interview", () => {
  it("only the student who applied can open it", async () => {
    const { owner, token } = await invite();
    const stranger = await createStudent();
    expect((await getInterviewForStudent(stranger.id, token)).state).toBe("not_found");
    expect((await getInterviewForStudent(owner.id, token)).state).toBe("not_found");
  });

  it("My Applications issues a fresh link and the emailed one stops working", async () => {
    const { student, application, token } = await invite();
    const stranger = await createStudent();
    expect(await reissueInterviewLink(stranger.id, application.id)).toBeNull();

    const fresh = await reissueInterviewLink(student.id, application.id);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(token);
    expect((await getInterviewForStudent(student.id, fresh!)).state).toBe("intro");
    expect((await getInterviewForStudent(student.id, token)).state).toBe("not_found");
  });

  it("needs consent and refuses voice when disabled", async () => {
    const { student, token } = await invite();
    expect(await startInterview(student.id, token, { mode: "chat", consent: false })).toMatchObject(
      {
        ok: false,
        reason: "no_consent",
      },
    );
    expect(await startInterview(student.id, token, { mode: "voice", consent: true })).toMatchObject(
      {
        ok: false,
        reason: "invalid",
      },
    );
  });

  it("runs 6 questions with one follow-up, guards double submits, then completes", async () => {
    const { owner, application, student, token } = await invite();
    stubLlm({ followUp: [{ followUp: "What was the result?" }, { followUp: "And then?" }] });

    const started = await startInterview(student.id, token, { mode: "chat", consent: true });
    expect(started.ok && started.view).toMatchObject({ state: "chat", currentIndex: 0 });
    const stored = await getDb().interviewSession.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    expect(stored).toMatchObject({ status: "in_progress", mode: "chat" });
    expect(stored.consentedAt).not.toBeNull();
    // One attempt: can't start again.
    expect(await startInterview(student.id, token, { mode: "chat", consent: true })).toMatchObject({
      ok: false,
    });

    // Q1 answer → follow-up (same question).
    const first = await submitAnswer(
      student.id,
      token,
      answer("I post.", 0, 1, { pasted: true, tabLeaves: 2 }),
    );
    expect(first.ok && first.view).toMatchObject({ state: "chat", currentIndex: 0 });
    if (!first.ok || first.view.state !== "chat") throw new Error("expected chat");
    expect(first.view.transcript.at(-1)).toEqual({
      role: "ai",
      text: "What was the result?",
      followUp: true,
    });

    // A double submit of the same answer is stale and doesn't skip anything.
    expect(await submitAnswer(student.id, token, answer("I post.", 0, 1))).toMatchObject({
      ok: false,
      reason: "stale",
    });

    // Follow-up answer → next question (cap of one follow-up, the LLM isn't asked again).
    const second = await submitAnswer(student.id, token, answer("Sales went up 20%.", 0, 3));
    expect(second.ok && second.view).toMatchObject({ currentIndex: 1 });

    // Q2 gets the second stubbed follow-up; Q3–Q6 get none.
    const q2 = await submitAnswer(student.id, token, answer("Answer 2", 1, 5));
    expect(q2.ok && q2.view).toMatchObject({ currentIndex: 1 });
    const q2b = await submitAnswer(student.id, token, answer("More detail", 1, 7));
    expect(q2b.ok && q2b.view).toMatchObject({ currentIndex: 2 });
    let turns = 9;
    for (let index = 2; index < 6; index++) {
      const result = await submitAnswer(
        student.id,
        token,
        answer(`Answer ${index + 1}`, index, turns),
      );
      expect(result.ok).toBe(true);
      turns += 2;
    }
    expect((await getInterviewForStudent(student.id, token)).state).toBe("done");
    await settleBackground();
    const done = await getDb().interviewSession.findFirstOrThrow({
      where: { applicationId: application.id },
    });
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(done.pasteCount).toBe(1);
    expect(done.tabLeaveCount).toBe(2);
    const transcript = done.transcript as { role: string; pasted?: boolean }[];
    expect(transcript.filter((turn) => turn.role === "student")).toHaveLength(8);
    expect(transcript[1]).toMatchObject({ role: "student", pasted: true });
    // The report ran (no evidence reply stubbed → failed), and the candidate didn't move.
    expect(done.reportStatus).toBe("failed");
    const app = await getDb().application.findUniqueOrThrow({ where: { id: application.id } });
    expect(app.status).toBe("submitted");

    // Completed: can't answer again; the organisation sees it.
    expect(
      await submitAnswer(student.id, token, answer("late", 6, transcript.length)),
    ).toMatchObject({
      ok: false,
      reason: "already_completed",
    });
    const views = await listInterviewsForApplications(owner.id, [application.id]);
    expect(views.get(application.id)?.[0]).toMatchObject({ status: "completed", pasteCount: 1 });
    const other = await createOrganisation();
    expect((await listInterviewsForApplications(other.id, [application.id])).size).toBe(0);
  });

  it("voice can switch to chat at the same question", async () => {
    process.env.VOICE_INTERVIEW_ENABLED = "true";
    const { student, token } = await invite();
    const started = await startInterview(student.id, token, { mode: "voice", consent: true });
    expect(started.ok && started.view.state).toBe("voice");
    const switched = await switchToChat(student.id, token);
    expect(switched.ok && switched.view).toMatchObject({ state: "chat", currentIndex: 0 });
    if (!switched.ok || switched.view.state !== "chat") throw new Error("expected chat");
    expect(switched.view.transcript).toHaveLength(1);
    expect(switched.view.transcript[0].role).toBe("ai");
  });
});
