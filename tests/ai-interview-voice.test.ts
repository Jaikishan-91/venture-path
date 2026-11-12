import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import type { TranscriptTurn, VoiceJoin, VoiceTranscriptPost } from "@/lib/v2/types";
import { VOICE_AGENT_NAME, VOICE_AGENT_SECRET_HEADER, voiceRoomName } from "@/lib/v2/types";

// WP-D voice interview: the voice-agent endpoints (shared secret, plan gating, idempotent
// transcript) and the student's livekit-token route (gating, with the LiveKit SDK stubbed).
// Needs the Docker Postgres from docker-compose.yml. Unique data per test; nothing is truncated.

const sessionMock = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string } },
}));
vi.mock("@/lib/authz", () => ({ getSession: async () => sessionMock.current }));

const livekit = vi.hoisted(() => ({
  createRoom: vi.fn(),
  listDispatch: vi.fn(),
  createDispatch: vi.fn(),
  grants: [] as unknown[],
  identities: [] as string[],
}));
vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: class {
    createRoom = livekit.createRoom;
  },
  AgentDispatchClient: class {
    listDispatch = livekit.listDispatch;
    createDispatch = livekit.createDispatch;
  },
  AccessToken: class {
    constructor(_key: string, _secret: string, opts: { identity: string }) {
      livekit.identities.push(opts.identity);
    }
    addGrant(grant: unknown) {
      livekit.grants.push(grant);
    }
    async toJwt() {
      return "jwt-stub";
    }
  },
  TrackSource: { MICROPHONE: 2 },
}));

const { getVoicePlan, recordVoiceTranscript, isValidVoiceAgentSecret } =
  await import("@/lib/ai-interview-voice");
const planRoute = await import("@/app/api/voice-agent/sessions/[sessionId]/plan/route");
const transcriptRoute = await import("@/app/api/voice-agent/sessions/[sessionId]/transcript/route");
const tokenRoute = await import("@/app/api/interview/[token]/livekit-token/route");

const EMAIL_DOMAIN = "voice-interview-test.venturepath.local";
const SECRET = "test-voice-secret-" + randomUUID();
const ENV_KEYS = [
  "VOICE_AGENT_SHARED_SECRET",
  "VOICE_INTERVIEW_ENABLED",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_PUBLIC_URL",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const createdUserIds: string[] = [];

beforeEach(() => {
  process.env.VOICE_AGENT_SHARED_SECRET = SECRET;
  process.env.VOICE_INTERVIEW_ENABLED = "true";
  process.env.LIVEKIT_URL = "ws://livekit.test:7880";
  process.env.LIVEKIT_API_KEY = "devkey";
  process.env.LIVEKIT_API_SECRET = "secret";
  delete process.env.LIVEKIT_PUBLIC_URL;
  sessionMock.current = null;
  livekit.createRoom.mockReset().mockResolvedValue({});
  livekit.listDispatch.mockReset().mockResolvedValue([]);
  livekit.createDispatch.mockReset().mockResolvedValue({});
  livekit.grants.length = 0;
  livekit.identities.length = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(async () => {
  // Cascades remove profiles, listings, applications and sessions created here.
  await getDb().user.deleteMany({ where: { id: { in: createdUserIds } } });
});

const QUESTIONS = [
  { id: "q1", text: "Tell me about a campaign you ran.", kind: "skill" },
  { id: "q2", text: "How would you grow our Instagram?", kind: "situation" },
  { id: "q3", text: "When can you start?", kind: "motivation" },
];

type Fixture = { sessionId: string; token: string; studentUserId: string };

async function createFixture(
  overrides: Partial<{
    status: "invited" | "in_progress" | "completed" | "expired";
    mode: "chat" | "voice" | null;
    consentedAt: Date | null;
    expiresAt: Date;
    currentIndex: number;
  }> = {},
): Promise<Fixture> {
  const db = getDb();
  const org = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Org owner",
      email: `org-${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Acme Foods",
          description: "Snacks",
          industry: "Food",
          location: "Pune",
          status: "approved",
        },
      },
    },
    include: { organisationProfile: true },
  });
  const student = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Asha Verma",
      email: `student-${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "COEP", course: "BBA", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
  createdUserIds.push(org.id, student.id);
  const opportunity = await db.opportunity.create({
    data: {
      organisationProfileId: org.organisationProfile!.id,
      type: "internship",
      title: "Marketing intern",
      description: "Social media.",
      skills: [],
      workMode: "remote",
      payType: "unpaid",
      status: "published",
    },
  });
  const stage = await db.pipelineStage.create({
    data: {
      opportunityId: opportunity.id,
      position: 0,
      name: "AI interview",
      kind: "ai_interview",
      source: "organisation",
    },
  });
  const application = await db.application.create({
    data: {
      opportunityId: opportunity.id,
      userProfileId: student.userProfile!.id,
      currentStageId: stage.id,
    },
  });
  const token = randomBytes(24).toString("base64url");
  const session = await db.interviewSession.create({
    data: {
      applicationId: application.id,
      stageId: stage.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: overrides.status ?? "in_progress",
      mode: overrides.mode === undefined ? "voice" : overrides.mode,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3 * 86_400_000),
      consentedAt: overrides.consentedAt === undefined ? new Date() : overrides.consentedAt,
      questions: QUESTIONS,
      currentIndex: overrides.currentIndex ?? 0,
    },
  });
  return { sessionId: session.id, token, studentUserId: student.id };
}

const turn = (role: TranscriptTurn["role"], text: string, questionId: string, at: string) => ({
  role,
  text,
  questionId,
  at,
});

function agentRequest(path: string, init: RequestInit & { secret?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (init.secret !== null) headers.set(VOICE_AGENT_SECRET_HEADER, init.secret ?? SECRET);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const params = <T>(value: T) => ({ params: Promise.resolve(value) });

async function loadSession(id: string) {
  return getDb().interviewSession.findUniqueOrThrow({ where: { id } });
}

describe("shared secret", () => {
  it("accepts only the configured secret", () => {
    expect(isValidVoiceAgentSecret(SECRET)).toBe(true);
    expect(isValidVoiceAgentSecret("wrong")).toBe(false);
    expect(isValidVoiceAgentSecret(null)).toBe(false);
    expect(isValidVoiceAgentSecret("")).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    delete process.env.VOICE_AGENT_SHARED_SECRET;
    expect(isValidVoiceAgentSecret("")).toBe(false);
    expect(isValidVoiceAgentSecret(SECRET)).toBe(false);
  });

  it("returns 401 from both agent routes without the right header", async () => {
    const { sessionId } = await createFixture();
    for (const secret of [null, "wrong"]) {
      const plan = await planRoute.GET(
        agentRequest(`/api/voice-agent/sessions/${sessionId}/plan`, { secret }),
        params({ sessionId }),
      );
      expect(plan.status).toBe(401);
      const post = await transcriptRoute.POST(
        agentRequest(`/api/voice-agent/sessions/${sessionId}/transcript`, {
          method: "POST",
          secret,
          body: JSON.stringify({ seq: 0, turns: [], currentIndex: 0, completed: true }),
        }),
        params({ sessionId }),
      );
      expect(post.status).toBe(401);
    }
    expect((await loadSession(sessionId)).status).toBe("in_progress");
  });
});

describe("getVoicePlan", () => {
  it("builds the plan for an in-progress voice session", async () => {
    const { sessionId } = await createFixture({ currentIndex: 1 });
    const res = await planRoute.GET(
      agentRequest(`/api/voice-agent/sessions/${sessionId}/plan`),
      params({ sessionId }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId,
      listingTitle: "Marketing intern",
      businessName: "Acme Foods",
      studentFirstName: "Asha",
      questions: QUESTIONS.map(({ id, text }) => ({ id, text })),
      currentIndex: 1,
      maxFollowUpsPerQuestion: 1,
      language: "en-IN",
    });
  });

  it("is null for chat mode, not started, completed and unknown sessions", async () => {
    for (const overrides of [
      { mode: "chat" as const },
      { status: "invited" as const, mode: null },
      { status: "completed" as const },
    ]) {
      const { sessionId } = await createFixture(overrides);
      expect(await getVoicePlan(sessionId)).toBeNull();
    }
    const res = await planRoute.GET(
      agentRequest(`/api/voice-agent/sessions/${randomUUID()}/plan`),
      params({ sessionId: randomUUID() }),
    );
    expect(res.status).toBe(404);
  });
});

describe("recordVoiceTranscript", () => {
  it("appends turns, is idempotent by seq/turn, and never moves backwards", async () => {
    const { sessionId } = await createFixture();
    const first: VoiceTranscriptPost = {
      seq: 0,
      turns: [
        turn("ai", "Hi Asha! Tell me about a campaign you ran.", "q1", "2026-11-12T10:00:01.000Z"),
        turn("student", "I ran a Diwali sale.", "q1", "2026-11-12T10:00:05.000Z"),
      ],
      currentIndex: 0,
      completed: false,
    };
    expect(await recordVoiceTranscript(sessionId, first)).toEqual({ ok: true, appended: 2 });
    // The same batch again (agent retried after a lost reply): nothing is added.
    expect(await recordVoiceTranscript(sessionId, first)).toEqual({ ok: true, appended: 0 });

    const second: VoiceTranscriptPost = {
      seq: 1,
      turns: [
        { ...turn("ai", "What was the result?", "q1", "2026-11-12T10:00:09.000Z"), followUp: true },
        turn("ai", "How would you grow our Instagram?", "q2", "2026-11-12T10:00:15.000Z"),
      ],
      currentIndex: 1,
      completed: false,
    };
    expect(await recordVoiceTranscript(sessionId, second)).toEqual({ ok: true, appended: 2 });
    // An old batch arriving late doesn't duplicate turns or move the index back.
    expect(await recordVoiceTranscript(sessionId, first)).toEqual({ ok: true, appended: 0 });

    const session = await loadSession(sessionId);
    const transcript = session.transcript as TranscriptTurn[];
    expect(transcript.map((t) => t.text)).toEqual([
      "Hi Asha! Tell me about a campaign you ran.",
      "I ran a Diwali sale.",
      "What was the result?",
      "How would you grow our Instagram?",
    ]);
    expect(transcript[2].followUp).toBe(true);
    expect(transcript[0]).not.toHaveProperty("followUp");
    expect(session.currentIndex).toBe(1);
    expect(session.status).toBe("in_progress");
  });

  it("completes the session on completed: true, and a repeated final batch is a no-op", async () => {
    const { sessionId } = await createFixture({ currentIndex: 2 });
    const final: VoiceTranscriptPost = {
      seq: 3,
      turns: [turn("student", "Next Monday.", "q3", "2026-11-12T10:10:00.000Z")],
      currentIndex: 3,
      completed: true,
    };
    const res = await transcriptRoute.POST(
      agentRequest(`/api/voice-agent/sessions/${sessionId}/transcript`, {
        method: "POST",
        body: JSON.stringify(final),
      }),
      params({ sessionId }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const session = await loadSession(sessionId);
    expect(session.status).toBe("completed");
    expect(session.completedAt).toBeInstanceOf(Date);
    expect(session.currentIndex).toBe(3);
    expect((session.transcript as TranscriptTurn[]).length).toBe(1);

    expect(await recordVoiceTranscript(sessionId, final)).toEqual({ ok: true, appended: 0 });
    expect(
      await recordVoiceTranscript(sessionId, { ...final, seq: 4, completed: false }),
    ).toMatchObject({ ok: false, reason: "already_completed" });
    expect((await loadSession(sessionId)).completedAt).toEqual(session.completedAt);
  });

  it("disconnect batch (completed: false) keeps the session open for chat", async () => {
    const { sessionId } = await createFixture();
    await recordVoiceTranscript(sessionId, {
      seq: 0,
      turns: [turn("ai", "Tell me about a campaign you ran.", "q1", "2026-11-12T10:00:01.000Z")],
      currentIndex: 0,
      completed: false,
    });
    const session = await loadSession(sessionId);
    expect(session.status).toBe("in_progress");
    expect(session.completedAt).toBeNull();
  });

  it("rejects invalid bodies and sessions that aren't live voice sessions", async () => {
    const { sessionId } = await createFixture();
    const bad = await transcriptRoute.POST(
      agentRequest(`/api/voice-agent/sessions/${sessionId}/transcript`, {
        method: "POST",
        body: JSON.stringify({ seq: -1, turns: [], currentIndex: 0, completed: false }),
      }),
      params({ sessionId }),
    );
    expect(bad.status).toBe(400);
    const notJson = await transcriptRoute.POST(
      agentRequest(`/api/voice-agent/sessions/${sessionId}/transcript`, {
        method: "POST",
        body: "{",
      }),
      params({ sessionId }),
    );
    expect(notJson.status).toBe(400);
    expect(
      await recordVoiceTranscript(sessionId, {
        seq: 0,
        turns: [turn("student", "hi", "not-a-question", "2026-11-12T10:00:01.000Z")],
        currentIndex: 0,
        completed: false,
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });

    const chat = await createFixture({ mode: "chat" });
    const res = await transcriptRoute.POST(
      agentRequest(`/api/voice-agent/sessions/${chat.sessionId}/transcript`, {
        method: "POST",
        body: JSON.stringify({ seq: 0, turns: [], currentIndex: 0, completed: true }),
      }),
      params({ sessionId: chat.sessionId }),
    );
    expect(res.status).toBe(404);
    expect((await loadSession(chat.sessionId)).status).toBe("in_progress");
    expect(
      await recordVoiceTranscript(randomUUID(), {
        seq: 0,
        turns: [],
        currentIndex: 0,
        completed: false,
      }),
    ).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("POST /api/interview/[token]/livekit-token", () => {
  const call = (token: string) =>
    tokenRoute.POST(
      new Request(`http://localhost/api/interview/${token}/livekit-token`, { method: "POST" }),
      params({ token }),
    );

  it("returns a mic-only join for the student and dispatches the interviewer", async () => {
    const fx = await createFixture();
    sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
    const res = await call(fx.token);
    expect(res.status).toBe(200);
    const join = (await res.json()) as VoiceJoin;
    expect(join).toEqual({
      url: "ws://livekit.test:7880",
      token: "jwt-stub",
      roomName: voiceRoomName(fx.sessionId),
    });
    expect(livekit.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: voiceRoomName(fx.sessionId),
        metadata: JSON.stringify({ sessionId: fx.sessionId }),
      }),
    );
    expect(livekit.createDispatch).toHaveBeenCalledWith(
      voiceRoomName(fx.sessionId),
      VOICE_AGENT_NAME,
      { metadata: JSON.stringify({ sessionId: fx.sessionId }) },
    );
    expect(livekit.grants).toEqual([
      expect.objectContaining({
        room: voiceRoomName(fx.sessionId),
        roomJoin: true,
        canPublishSources: [2],
        canPublishData: false,
      }),
    ]);
    expect(livekit.identities).toEqual([`student-${fx.studentUserId}`]);
  });

  it("doesn't dispatch a second interviewer while one is pending or running", async () => {
    const fx = await createFixture();
    sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
    livekit.listDispatch.mockResolvedValue([
      { agentName: VOICE_AGENT_NAME, state: { jobs: [{ state: { status: 1 } }] } },
    ]);
    expect((await call(fx.token)).status).toBe(200);
    expect(livekit.createDispatch).not.toHaveBeenCalled();

    // A finished job (status 2) gets a fresh dispatch, e.g. after a reload.
    livekit.listDispatch.mockResolvedValue([
      { agentName: VOICE_AGENT_NAME, state: { jobs: [{ state: { status: 2 } }] } },
    ]);
    expect((await call(fx.token)).status).toBe(200);
    expect(livekit.createDispatch).toHaveBeenCalledTimes(1);
  });

  it("is 404 when voice is disabled or LiveKit isn't configured", async () => {
    const fx = await createFixture();
    sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
    process.env.VOICE_INTERVIEW_ENABLED = "false";
    expect((await call(fx.token)).status).toBe(404);
    process.env.VOICE_INTERVIEW_ENABLED = "true";
    delete process.env.LIVEKIT_API_SECRET;
    expect((await call(fx.token)).status).toBe(404);
    expect(livekit.createRoom).not.toHaveBeenCalled();
  });

  it("requires the signed-in applicant", async () => {
    const fx = await createFixture();
    expect((await call(fx.token)).status).toBe(401);
    sessionMock.current = { user: { id: randomUUID(), role: "user" } };
    expect((await call(fx.token)).status).toBe(404);
    sessionMock.current = { user: { id: fx.studentUserId, role: "organisation" } };
    expect((await call(fx.token)).status).toBe(404);
    sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
    expect((await call("wrong-token")).status).toBe(404);
    expect(livekit.createRoom).not.toHaveBeenCalled();
  });

  it("refuses sessions without consent, expired, in chat mode or completed", async () => {
    const cases = [
      { consentedAt: null },
      { expiresAt: new Date(Date.now() - 1000) },
      { mode: "chat" as const },
      { status: "completed" as const },
    ];
    for (const overrides of cases) {
      const fx = await createFixture(overrides);
      sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
      expect((await call(fx.token)).status).toBe(409);
    }
    expect(livekit.createRoom).not.toHaveBeenCalled();
  });

  it("answers 503 when LiveKit is unreachable", async () => {
    const fx = await createFixture();
    sessionMock.current = { user: { id: fx.studentUserId, role: "user" } };
    livekit.createRoom.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await call(fx.token)).status).toBe(503);
  });
});
