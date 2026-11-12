import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The local embedding model is slow; a text containing "COPY" maps to one fixed vector, any other
// text to its own one-hot vector, so only the "COPY" texts look identical.
vi.mock("@/lib/embeddings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/embeddings")>();
  let next = 1;
  const seen = new Map<string, number>();
  return {
    ...actual,
    embed: vi.fn(async (text: string) => {
      const vector = Array<number>(actual.EMBEDDING_DIMENSIONS).fill(0);
      if (text.includes("COPY")) vector[0] = 1;
      else {
        if (!seen.has(text)) seen.set(text, next++);
        vector[seen.get(text)! % actual.EMBEDDING_DIMENSIONS || 1] = 1;
      }
      return vector;
    }),
  };
});

import { settleBackground } from "@/lib/background";
import { assistChallenge, parseChallengeAssist } from "@/lib/challenge-assist";
import {
  closeChallenge,
  getChallengeSubmission,
  listChallengeSubmissions,
  markRewardPaid,
  offerHire,
  placementEmail,
  setPlacement,
} from "@/lib/challenge-reviews";
import { deadlineFromIndiaDate, type ChallengeInput } from "@/lib/challenge-schemas";
import { parseChallengeScore, verbatimQuote } from "@/lib/challenge-scoring";
import {
  createChallenge,
  deleteDraftChallenge,
  getChallengeFile,
  getOwnSubmission,
  getSubmissionFile,
  getVisibleChallenge,
  listOpenChallenges,
  listOwnSubmissions,
  publishChallenge,
  stopSubmissions,
  submitSolution,
  updateChallenge,
} from "@/lib/challenges";
import { getDb } from "@/lib/db";
import * as emailLib from "@/lib/email";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { uploadsDirectory } from "@/lib/uploads";

const EMAIL_DOMAIN = `challenges-${randomUUID().slice(0, 8)}.venturepath.local`;
const sendEmailSpy = vi.spyOn(emailLib, "sendEmail").mockResolvedValue(undefined);

async function createUser(role: "user" | "organisation", options: { approved?: boolean } = {}) {
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
                businessName: "Sharma Sweets",
                description: "Sweets",
                industry: "Food",
                location: "Jaipur",
                status: options.approved === false ? "pending" : "approved",
              },
            },
          }),
    },
    include: { userProfile: true, organisationProfile: true },
  });
}

const tomorrow = () =>
  deadlineFromIndiaDate(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

const challengeInput = (overrides: Partial<ChallengeInput> = {}): ChallengeInput => ({
  title: "Our Instagram gets no customers",
  problem: "We post every day but nobody visits the shop.",
  goodSolution: null,
  criteria: ["Practical for a small shop", "Low cost"],
  rewardMoneyInr: 2000,
  rewardHire: false,
  deadline: tomorrow(),
  ...overrides,
});

async function openChallenge(orgUserId: string, overrides: Partial<ChallengeInput> = {}) {
  const created = await createChallenge(orgUserId, challengeInput(overrides), { publish: true });
  if (!created.ok) throw new Error(created.reason);
  return created.id;
}

/** Push the deadline into the past, as if time passed. */
const expire = (challengeId: string) =>
  getDb().challenge.update({
    where: { id: challengeId },
    data: { deadline: new Date(Date.now() - 1000) },
  });

const solution = (text: string, link: string | null = null) => ({ text, link });
const file = (name = "plan.pdf") => ({
  fileName: name,
  extension: "pdf" as const,
  bytes: Buffer.from("%PDF-1.4 test"),
});

function stubLlm(replies: { assist?: object | string; scoring?: object | string }) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
    const prompt = body.messages[1].content;
    const reply = prompt.includes("You judge one student's solution")
      ? replies.scoring
      : prompt.includes("post a business challenge")
        ? replies.assist
        : undefined;
    if (reply === undefined) return new Response("unavailable", { status: 503 });
    const content = typeof reply === "string" ? reply : JSON.stringify(reply);
    return Response.json({ choices: [{ message: { content } }] });
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

const exists = (key: string) =>
  access(path.join(uploadsDirectory(), key)).then(
    () => true,
    () => false,
  );

let filesDir: string;

beforeAll(async () => {
  filesDir = await mkdtemp(path.join(tmpdir(), "vp-challenges-"));
  process.env.FILES_DIR = filesDir;
});

beforeEach(() => sendEmailSpy.mockClear());

afterEach(async () => {
  await settleBackground();
  disableLlm();
});

afterAll(async () => {
  await settleBackground();
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
  await rm(filesDir, { recursive: true, force: true });
});

describe("posting", () => {
  it("only approved organisations can create and publish", async () => {
    const pending = await createUser("organisation", { approved: false });
    expect(await createChallenge(pending.id, challengeInput(), { publish: true })).toEqual({
      ok: false,
      reason: "not_approved",
    });

    const org = await createUser("organisation");
    const draft = await createChallenge(org.id, challengeInput(), { publish: false });
    if (!draft.ok) throw new Error(draft.reason);
    expect(await getVisibleChallenge(draft.id)).toBeNull();
    expect(await publishChallenge(org.id, draft.id)).toEqual({ ok: true });
    expect(await publishChallenge(org.id, draft.id)).toMatchObject({ reason: "wrong_status" });
    expect((await getVisibleChallenge(draft.id))?.status).toBe("open");
    expect((await listOpenChallenges()).some((c) => c.id === draft.id)).toBe(true);
  });

  it("refuses to publish a draft without a reward", async () => {
    const org = await createUser("organisation");
    const draft = await createChallenge(
      org.id,
      challengeInput({ rewardMoneyInr: null, rewardHire: false }),
      { publish: false },
    );
    if (!draft.ok) throw new Error(draft.reason);
    expect(await publishChallenge(org.id, draft.id)).toMatchObject({ reason: "no_reward" });
  });

  it("lets only the owner edit or delete, and deletes the draft's file", async () => {
    const org = await createUser("organisation");
    const other = await createUser("organisation");
    const draft = await createChallenge(org.id, challengeInput(), {
      publish: false,
      file: file("sample.pdf"),
    });
    if (!draft.ok) throw new Error(draft.reason);
    expect(await updateChallenge(other.id, draft.id, challengeInput(), { publish: false })).toEqual(
      {
        ok: false,
        reason: "not_found",
      },
    );
    expect(await deleteDraftChallenge(other.id, draft.id)).toMatchObject({ reason: "not_found" });

    // Owner can read the draft's attachment; the public can't until it is published.
    expect(await getChallengeFile(draft.id, org.id)).toMatchObject({ fileName: "sample.pdf" });
    expect(await getChallengeFile(draft.id, null)).toBeNull();
    const { fileKey } = (await getChallengeFile(draft.id, org.id))!;
    expect(await exists(fileKey)).toBe(true);

    expect(await deleteDraftChallenge(org.id, draft.id)).toEqual({ ok: true });
    expect(await exists(fileKey)).toBe(false);
  });
});

describe("submitting", () => {
  it("one editable submission per student, mirrored as a proof card, locking the judging points", async () => {
    const org = await createUser("organisation");
    const student = await createUser("user");
    const id = await openChallenge(org.id);

    const first = await submitSolution(student.id, id, solution("Run a reel contest."), file());
    expect(first).toMatchObject({ ok: true, created: true });
    const again = await submitSolution(
      student.id,
      id,
      solution("Run a reel contest with a free sweet box.", "https://example.com/plan"),
      undefined,
    );
    expect(again).toMatchObject({ ok: true, created: false });
    await settleBackground();

    const rows = await getDb().challengeSubmission.findMany({ where: { challengeId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      text: "Run a reel contest with a free sweet box.",
      fileName: "plan.pdf",
      aiScoreStatus: "skipped",
    });
    const proof = await getDb().proof.findUniqueOrThrow({
      where: { challengeSubmissionId: rows[0].id },
    });
    expect(proof).toMatchObject({
      source: "challenge",
      level: "added",
      title: "Our Instagram gets no customers",
      whatIDid: "Run a reel contest with a free sweet box.",
      link: "https://example.com/plan",
      fileName: "plan.pdf",
    });
    // The proof keeps its own copy of the file.
    expect(proof.fileKey).not.toBe(rows[0].fileKey);

    const challenge = await getDb().challenge.findUniqueOrThrow({ where: { id } });
    expect(challenge.criteriaLockedAt).not.toBeNull();
    expect(
      await updateChallenge(org.id, id, challengeInput({ criteria: ["Something else"] }), {
        publish: false,
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await updateChallenge(org.id, id, challengeInput({ rewardMoneyInr: 100 }), {
        publish: false,
      }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await updateChallenge(
        org.id,
        id,
        challengeInput({ title: "Instagram brings no customers" }),
        {
          publish: false,
        },
      ),
    ).toEqual({ ok: true });

    // The student sees their own submission and no scores.
    const own = await getOwnSubmission(student.id, id);
    expect(own).not.toHaveProperty("aiScore");
    const mine = await listOwnSubmissions(student.id);
    expect(mine[0]).not.toHaveProperty("aiScore");
  });

  it("removing the file deletes both copies", async () => {
    const org = await createUser("organisation");
    const student = await createUser("user");
    const id = await openChallenge(org.id);
    const saved = await submitSolution(student.id, id, solution("Idea"), file());
    if (!saved.ok) throw new Error(saved.reason);
    const before = await getDb().challengeSubmission.findUniqueOrThrow({
      where: { id: saved.id },
      include: { proof: true },
    });
    await submitSolution(student.id, id, solution("Idea"), null);
    const after = await getDb().challengeSubmission.findUniqueOrThrow({
      where: { id: saved.id },
      include: { proof: true },
    });
    expect(after.fileKey).toBeNull();
    expect(after.proof?.fileKey).toBeNull();
    expect(await exists(before.fileKey!)).toBe(false);
    expect(await exists(before.proof!.fileKey!)).toBe(false);
  });

  it("closes at the deadline and needs a profile and a visible challenge", async () => {
    const org = await createUser("organisation");
    const student = await createUser("user");
    const id = await openChallenge(org.id);
    expect(await submitSolution(org.id, id, solution("x"), undefined)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    const draft = await createChallenge(org.id, challengeInput(), { publish: false });
    if (!draft.ok) throw new Error(draft.reason);
    expect(await submitSolution(student.id, draft.id, solution("x"), undefined)).toMatchObject({
      reason: "not_found",
    });

    await expire(id);
    expect(await submitSolution(student.id, id, solution("late"), undefined)).toMatchObject({
      reason: "deadline_passed",
    });
    // Reading it moves the stored status to judging.
    expect((await getVisibleChallenge(id))?.status).toBe("judging");
  });

  it("limits submission files to the student and the owning organisation", async () => {
    const org = await createUser("organisation");
    const otherOrg = await createUser("organisation");
    const student = await createUser("user");
    const otherStudent = await createUser("user");
    const id = await openChallenge(org.id);
    const saved = await submitSolution(student.id, id, solution("Idea"), file("mine.pdf"));
    if (!saved.ok) throw new Error(saved.reason);
    expect(await getSubmissionFile(saved.id, student.id)).toMatchObject({ fileName: "mine.pdf" });
    expect(await getSubmissionFile(saved.id, org.id)).toMatchObject({ fileName: "mine.pdf" });
    expect(await getSubmissionFile(saved.id, otherStudent.id)).toBeNull();
    expect(await getSubmissionFile(saved.id, otherOrg.id)).toBeNull();
  });
});

describe("AI scoring and similarity", () => {
  it("scores in the background, computes the total, keeps only real quotes and sorts", async () => {
    const org = await createUser("organisation");
    const [a, b, c] = await Promise.all([
      createUser("user"),
      createUser("user"),
      createUser("user"),
    ]);
    const id = await openChallenge(org.id);

    const fetchMock = stubLlm({
      scoring: {
        criteria: [
          { criterion: "ignored", score: 5, quote: "free sweet box" },
          { criterion: "ignored", score: 9, quote: "words the student never wrote" },
        ],
        reason: "Clear, cheap idea.",
        quote: "made up",
      },
    });
    await submitSolution(
      a.id,
      id,
      solution("Give a free sweet box to every reel creator."),
      undefined,
    );
    await settleBackground();
    const scored = await getDb().challengeSubmission.findFirstOrThrow({
      where: { challengeId: id, userProfileId: a.userProfile!.id },
    });
    expect(scored).toMatchObject({
      aiScoreStatus: "done",
      aiScore: 10,
      aiReason: "Clear, cheap idea.",
      aiQuote: "free sweet box",
      aiModel: "test-model",
    });
    expect(scored.aiBreakdown).toEqual([
      { criterion: "Practical for a small shop", score: 5, quote: "free sweet box" },
      { criterion: "Low cost", score: 5, quote: "" },
    ]);
    // The student's text is wrapped as data with a system message saying so.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages[0].content).toMatch(/data, not instructions/);
    expect(body.messages[1].content).toContain("<submission>");

    stubLlm({ scoring: "not json" });
    await submitSolution(b.id, id, solution("Something else entirely COPY"), undefined);
    await settleBackground();
    disableLlm();
    await submitSolution(c.id, id, solution("Something else entirely COPY again"), undefined);
    await settleBackground();

    const list = await listChallengeSubmissions(org.id, id);
    expect(list?.submissions.map((s) => [s.userProfile.user.name, s.aiScoreStatus])).toEqual([
      ["Test user", "done"],
      ["Test user", "failed"],
      ["Test user", "skipped"],
    ]);
    expect(list?.submissions.map((s) => s.similar)).toEqual([false, true, true]);
    const cSubmission = list!.submissions[2];
    const detail = await getChallengeSubmission(org.id, id, list!.submissions[1].id);
    expect(detail?.similarTo).toBe(cSubmission.id);

    // Another organisation sees nothing.
    const other = await createUser("organisation");
    expect(await listChallengeSubmissions(other.id, id)).toBeNull();
    expect(await getChallengeSubmission(other.id, id, cSubmission.id)).toBeNull();
  });

  it("parses scores against the challenge's own points", () => {
    const text = "We will post reels daily and give coupons.";
    expect(verbatimQuote("“post reels  DAILY”", text)).toBe("post reels  DAILY");
    expect(verbatimQuote("something else", text)).toBe("");
    expect(parseChallengeScore('{"criteria":[{"score":"x"}]}', ["a"], text)).toBeNull();
    expect(parseChallengeScore('{"criteria":[{"score":2}]}', ["a", "b"], text)).toBeNull();
    expect(
      parseChallengeScore(
        '```json\n{"criteria":[{"score":-3,"quote":"give coupons"},{"score":4.6}],"reason":"ok"}\n```',
        ["a", "b"],
        text,
      ),
    ).toEqual({
      breakdown: [
        { criterion: "a", score: 0, quote: "give coupons" },
        { criterion: "b", score: 5, quote: "" },
      ],
      score: 5,
      reason: "ok",
      quote: "give coupons",
    });
  });
});

describe("make it clearer with AI", () => {
  it("returns a clearer problem and up to three judging points, or degrades", async () => {
    expect(await assistChallenge({ title: "", problem: "Sales low", goodSolution: "" })).toEqual({
      ok: false,
      reason: "no_llm",
    });
    stubLlm({
      assist: {
        problem: "Our sales are low.",
        criteria: ["Cheap", "cheap", "Quick", "Local", "Fun"],
      },
    });
    expect(await assistChallenge({ title: "", problem: "Sales low", goodSolution: "" })).toEqual({
      ok: true,
      problem: "Our sales are low.",
      criteria: ["Cheap", "Quick", "Local"],
    });
    expect(parseChallengeAssist('{"criteria":[]}')).toBeNull();
  });
});

describe("judging and reward", () => {
  async function judgingWithTwo(overrides: Partial<ChallengeInput> = {}) {
    const org = await createUser("organisation");
    const winner = await createUser("user");
    const second = await createUser("user");
    const third = await createUser("user");
    const id = await openChallenge(org.id, overrides);
    const ids: string[] = [];
    for (const student of [winner, second, third]) {
      const saved = await submitSolution(
        student.id,
        id,
        solution(`Idea by ${student.id}`),
        undefined,
      );
      if (!saved.ok) throw new Error(saved.reason);
      ids.push(saved.id);
    }
    await settleBackground();
    return { org, winner, second, third, id, ids };
  }

  it("money: pick winner and runner-up, mark paid, close; proofs turn verified; emails sent", async () => {
    const { org, winner, second, third, id, ids } = await judgingWithTwo();

    // No placement while students can still submit.
    expect(await setPlacement(org.id, id, ids[0], "winner")).toMatchObject({
      reason: "wrong_status",
    });
    expect(await stopSubmissions(org.id, id)).toEqual({ ok: true });

    const other = await createUser("organisation");
    expect(await setPlacement(other.id, id, ids[0], "winner")).toMatchObject({
      reason: "not_found",
    });

    expect(await closeChallenge(org.id, id)).toMatchObject({ reason: "invalid" });
    expect(await setPlacement(org.id, id, ids[1], "winner")).toEqual({ ok: true });
    // Switching the winner moves it; the first pick's proof goes back to added.
    expect(await setPlacement(org.id, id, ids[0], "winner")).toEqual({ ok: true });
    expect(await setPlacement(org.id, id, ids[1], "runner_up")).toEqual({ ok: true });
    await settleBackground();

    const proofs = await getDb().proof.findMany({
      where: { challengeSubmissionId: { in: ids } },
      select: { challengeSubmissionId: true, level: true },
    });
    const level = (submissionId: string) =>
      proofs.find((proof) => proof.challengeSubmissionId === submissionId)?.level;
    expect([level(ids[0]), level(ids[1]), level(ids[2])]).toEqual([
      "verified",
      "verified",
      "added",
    ]);
    const decided = await getDb().challengeSubmission.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(decided).toMatchObject({ placement: "winner", decidedById: org.id });
    expect(decided.decidedAt).not.toBeNull();
    expect(sendEmailSpy.mock.calls.map((call) => call[0].to)).toContain(winner.email);
    expect(
      sendEmailSpy.mock.calls.find((call) => call[0].to === winner.email)?.[0].subject,
    ).toMatch(/^You won/);

    expect(await closeChallenge(org.id, id)).toMatchObject({ reason: "reward_unpaid" });
    expect(await markRewardPaid(org.id, id, ids[1])).toMatchObject({ reason: "invalid" });
    expect(await markRewardPaid(org.id, id, ids[0])).toEqual({ ok: true });
    // A rewarded placement can't change any more.
    expect(await setPlacement(org.id, id, ids[0], "none")).toMatchObject({ reason: "invalid" });
    expect(await setPlacement(org.id, id, ids[2], "winner")).toMatchObject({ reason: "invalid" });

    sendEmailSpy.mockClear();
    expect(await closeChallenge(org.id, id)).toEqual({ ok: true });
    await settleBackground();
    expect(sendEmailSpy.mock.calls.map((call) => call[0].to)).toEqual([third.email]);
    expect(sendEmailSpy.mock.calls[0][0].subject).toMatch(/Challenge result/);

    expect(await setPlacement(org.id, id, ids[2], "runner_up")).toMatchObject({
      reason: "wrong_status",
    });
    const results = await listOwnSubmissions(second.id);
    expect(results[0]).toMatchObject({ placement: "runner_up", challenge: { status: "done" } });
  });

  it("hire: offer with a message and the organisation's own listing", async () => {
    const { org, winner, id, ids } = await judgingWithTwo({
      rewardMoneyInr: null,
      rewardHire: true,
    });
    await expire(id);
    expect(await setPlacement(org.id, id, ids[0], "winner")).toEqual({ ok: true });
    expect(await markRewardPaid(org.id, id, ids[0])).toMatchObject({ reason: "invalid" });
    expect(await offerHire(org.id, id, ids[1], { message: "", opportunityId: null })).toMatchObject(
      {
        reason: "invalid",
      },
    );

    const foreignOrg = await createUser("organisation");
    const foreignListing = await getDb().opportunity.create({
      data: {
        organisationProfileId: foreignOrg.organisationProfile!.id,
        type: "internship",
        title: "Not yours",
        description: "x",
        workMode: "remote",
        payType: "unpaid",
        status: "published",
      },
    });
    expect(
      await offerHire(org.id, id, ids[0], { message: "", opportunityId: foreignListing.id }),
    ).toMatchObject({ reason: "invalid" });

    const listing = await getDb().opportunity.create({
      data: {
        organisationProfileId: org.organisationProfile!.id,
        type: "internship",
        title: "Social media intern",
        description: "x",
        workMode: "remote",
        payType: "unpaid",
        status: "published",
      },
    });
    sendEmailSpy.mockClear();
    expect(
      await offerHire(org.id, id, ids[0], { message: "Join us!", opportunityId: listing.id }),
    ).toEqual({ ok: true });
    await settleBackground();
    const email = sendEmailSpy.mock.calls.find((call) => call[0].to === winner.email)?.[0];
    expect(email?.text).toContain("Join us!");
    expect(email?.text).toContain(`/opportunities/${listing.id}`);
    expect(
      await getDb().challengeSubmission.findUniqueOrThrow({ where: { id: ids[0] } }),
    ).toMatchObject({ rewardStatus: "hire_offered", hireMessage: "Join us!" });
    expect(await closeChallenge(org.id, id)).toEqual({ ok: true });
  });

  it("money and hire: the money must be marked paid before the hire offer", async () => {
    const { org, id, ids } = await judgingWithTwo({ rewardHire: true });
    await stopSubmissions(org.id, id);
    await setPlacement(org.id, id, ids[0], "winner");
    expect(await offerHire(org.id, id, ids[0], { message: "", opportunityId: null })).toMatchObject(
      {
        reason: "reward_unpaid",
      },
    );
    await markRewardPaid(org.id, id, ids[0]);
    expect(await offerHire(org.id, id, ids[0], { message: "", opportunityId: null })).toEqual({
      ok: true,
    });
    expect(await closeChallenge(org.id, id)).toEqual({ ok: true });
  });

  it("a challenge nobody entered can be closed", async () => {
    const org = await createUser("organisation");
    const id = await openChallenge(org.id);
    await expire(id);
    expect(await closeChallenge(org.id, id)).toEqual({ ok: true });
  });

  it("writes the placement email", () => {
    const message = placementEmail({
      studentName: "Priya",
      placement: "winner",
      challengeTitle: "Instagram",
      businessName: "Sharma Sweets",
      reward: "₹2,000",
      hasMoney: true,
      url: "http://localhost/challenges/1",
    });
    expect(message.subject).toBe("You won: Instagram");
    expect(message.text).toContain("₹2,000");
    expect(message.text).toContain("Verified proof");
  });
});
