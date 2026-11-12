import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Every hostname resolves to one public address, so the SSRF guard passes without real DNS.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
// The local embedding model is slow; listings get a fixed vector.
vi.mock("@/lib/embeddings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/embeddings")>();
  return {
    ...actual,
    embed: vi.fn(async () => [1, ...Array<number>(actual.EMBEDDING_DIMENSIONS - 1).fill(0)]),
  };
});

import { applyToOpportunity, withdrawApplication } from "@/lib/applications";
import { settleBackground } from "@/lib/background";
import { getDb } from "@/lib/db";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { changeOpportunityStatus, createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import type { ProofInput } from "@/lib/proof-schemas";
import {
  createProof,
  deleteProof,
  getProofFileForUser,
  listOwnProofs,
  updateProof,
} from "@/lib/proofs";
import { analyzeApplication } from "@/lib/resume-analysis";
import { uploadsDirectory } from "@/lib/uploads";
import { MAX_MANUAL_PROOFS } from "@/lib/v2/types";

const EMAIL_DOMAIN = "proofs-test.venturepath.local";

async function createUser(role: "user" | "organisation") {
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
                status: "approved",
              },
            },
          }),
    },
  });
}

const listing: OpportunityInput = {
  type: "internship",
  title: "Social media intern",
  description: "Run our Instagram.",
  skills: ["canva"],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 5000,
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

const card = (overrides: Partial<ProofInput> = {}): ProofInput => ({
  title: "Instagram posts for a sweet shop",
  link: "https://instagram.example/sharmasweets",
  whatIDid: "Wrote and designed 30 posts in Canva; followers went from 200 to 900.",
  skills: ["canva", "content writing"],
  ...overrides,
});
const pngFile = { fileName: "poster.png", extension: "png" as const, bytes: Buffer.from("png") };

type Stub = { proof?: object | string; resume?: object | string; linkStatus?: number };

/** One fetch stub for both the LLM endpoint and the link check, by URL. */
function stubFetch(stub: Stub) {
  const prompts: string[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (!url.startsWith("http://llm.test/")) {
      return new Response(null, { status: stub.linkStatus ?? 200 });
    }
    const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
    const prompt = body.messages[1].content;
    prompts.push(prompt);
    const reply = prompt.includes("You check a student's proof card") ? stub.proof : stub.resume;
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
  return { fetchMock, prompts };
}

function disableLlm() {
  vi.unstubAllGlobals();
  process.env.LLM_PROVIDER = "disabled";
  clearLlmConfigCache();
}

const getProof = (id: string) => getDb().proof.findUniqueOrThrow({ where: { id } });
const exists = (key: string) =>
  access(path.join(uploadsDirectory(), key)).then(
    () => true,
    () => false,
  );

async function added(userId: string, input = card(), file: typeof pngFile | null = null) {
  const result = await createProof(userId, input, file);
  if (!result.ok) throw new Error(result.reason);
  await settleBackground();
  return result.id;
}

let filesDir: string;

beforeAll(async () => {
  filesDir = await mkdtemp(path.join(tmpdir(), "vp-proofs-"));
  process.env.FILES_DIR = filesDir;
  process.env.UPLOAD_DIR = filesDir;
});

afterEach(disableLlm);

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
  await rm(filesDir, { recursive: true, force: true });
});

describe("proof check", () => {
  it("turns 🔵 when the link opens and the AI finds it plausible", async () => {
    const user = await createUser("user");
    const { fetchMock } = stubFetch({ proof: { score: 4, reason: "Mentions 30 Canva posts." } });
    const id = await added(user.id);

    expect(await getProof(id)).toMatchObject({
      level: "checked",
      aiScore: 4,
      aiReason: "Mentions 30 Canva posts.",
      aiScoreStatus: "done",
      source: "manual",
    });
    expect((await getProof(id)).checkedAt).toBeInstanceOf(Date);
    const linkCall = fetchMock.mock.calls.find(([url]) => !url.startsWith("http://llm.test/"));
    expect(linkCall?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("stays ⚪ for a low score, a dead link, or without AI", async () => {
    const user = await createUser("user");
    stubFetch({ proof: { score: 2, reason: "Vague." } });
    expect((await getProof(await added(user.id))).level).toBe("added");

    stubFetch({ proof: { score: 5, reason: "Great." }, linkStatus: 404 });
    expect(await getProof(await added(user.id))).toMatchObject({ level: "added", aiScore: 5 });

    disableLlm();
    expect(await getProof(await added(user.id))).toMatchObject({
      level: "added",
      aiScore: null,
      aiScoreStatus: "skipped",
    });

    stubFetch({ proof: "not json" });
    expect((await getProof(await added(user.id))).aiScoreStatus).toBe("failed");
  });

  it("checks a file-only card without fetching anything but the LLM", async () => {
    const user = await createUser("user");
    const { fetchMock } = stubFetch({ proof: { score: 3, reason: "Fits." } });
    const id = await added(user.id, card({ link: null }), pngFile);
    expect((await getProof(id)).level).toBe("checked");
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith("http://llm.test/"))).toBe(true);
  });
});

describe("proof cards", () => {
  it("needs a link or a file, and a profile", async () => {
    const user = await createUser("user");
    const organisation = await createUser("organisation");
    expect(await createProof(user.id, card({ link: null }), null)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await createProof(organisation.id, card(), null)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it(`holds at most ${MAX_MANUAL_PROOFS} manual cards; task cards don't count`, async () => {
    const user = await createUser("user");
    const profile = await getDb().userProfile.findUniqueOrThrow({ where: { userId: user.id } });
    await getDb().proof.create({
      data: { userProfileId: profile.id, source: "apply_task", title: "Task", whatIDid: "x" },
    });
    for (let i = 0; i < MAX_MANUAL_PROOFS; i++) {
      expect(await createProof(user.id, card({ title: `Card ${i}` }), null)).toMatchObject({
        ok: true,
      });
    }
    expect(await createProof(user.id, card(), null)).toEqual({ ok: false, reason: "too_many" });
    await settleBackground();
  });

  it("lists strongest first and resets the check on edit", async () => {
    const user = await createUser("user");
    stubFetch({ proof: { score: 1, reason: "Weak." } });
    const weak = await added(user.id, card({ title: "Weak" }));
    stubFetch({ proof: { score: 5, reason: "Strong." } });
    const strong = await added(user.id, card({ title: "Strong" }));
    expect((await listOwnProofs(user.id)).map((p) => p.id)).toEqual([strong, weak]);
    expect((await listOwnProofs(user.id))[0]).not.toHaveProperty("aiScore");

    disableLlm();
    expect(
      await updateProof(user.id, strong, card({ title: "Edited" }), {
        file: null,
        removeFile: false,
      }),
    ).toEqual({ ok: true });
    expect(await getProof(strong)).toMatchObject({
      title: "Edited",
      level: "added",
      aiScore: null,
      aiReason: null,
      aiScoreStatus: "pending",
    });
    await settleBackground();
    expect((await getProof(strong)).aiScoreStatus).toBe("skipped");
  });

  it("lets only the owner edit or delete, and never a challenge card", async () => {
    const user = await createUser("user");
    const other = await createUser("user");
    const id = await added(user.id);
    const keep = { file: null, removeFile: false };
    expect(await updateProof(other.id, id, card(), keep)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteProof(other.id, id)).toEqual({ ok: false, reason: "not_found" });

    const profile = await getDb().userProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const challenge = await getDb().proof.create({
      data: {
        userProfileId: profile.id,
        source: "challenge",
        level: "verified",
        title: "Winner",
        whatIDid: "Won",
      },
    });
    expect(await updateProof(user.id, challenge.id, card(), keep)).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await deleteProof(user.id, challenge.id)).toEqual({ ok: false, reason: "locked" });
    expect((await getProof(challenge.id)).level).toBe("verified");
  });

  it("replaces and removes files, and deletes the file with the card", async () => {
    const user = await createUser("user");
    const id = await added(user.id, card(), pngFile);
    const firstKey = (await getProof(id)).fileKey!;
    expect(await exists(firstKey)).toBe(true);

    expect(
      await updateProof(user.id, id, card({ link: null }), { file: null, removeFile: true }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await updateProof(user.id, id, card(), {
        file: { ...pngFile, fileName: "new.png" },
        removeFile: false,
      }),
    ).toEqual({ ok: true });
    const replaced = await getProof(id);
    expect(replaced.fileName).toBe("new.png");
    expect(await exists(firstKey)).toBe(false);

    expect(await deleteProof(user.id, id)).toEqual({ ok: true });
    expect(await exists(replaced.fileKey!)).toBe(false);
    await settleBackground();
  });

  it("locks a card while an application uses it, and shares its file with that organisation only", async () => {
    const user = await createUser("user");
    const stranger = await createUser("user");
    const organisation = await createUser("organisation");
    const otherOrganisation = await createUser("organisation");
    const opportunityId = await publishedListing(organisation.id);
    const id = await added(user.id, card(), pngFile);

    expect(await getProofFileForUser(user.id, id)).toMatchObject({ fileName: "poster.png" });
    expect(await getProofFileForUser(organisation.id, id)).toBeNull();

    const applied = await applyToOpportunity(user.id, opportunityId, { note: "", proofIds: [id] });
    if (!applied.ok) throw new Error(applied.reason);
    await settleBackground();

    expect(await getProofFileForUser(organisation.id, id)).toMatchObject({
      fileName: "poster.png",
    });
    expect(await getProofFileForUser(otherOrganisation.id, id)).toBeNull();
    expect(await getProofFileForUser(stranger.id, id)).toBeNull();

    expect(await deleteProof(user.id, id)).toEqual({ ok: false, reason: "locked" });
    expect(await updateProof(user.id, id, card(), { file: null, removeFile: false })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await withdrawApplication(user.id, applied.id)).toEqual({ ok: true });
    expect(await deleteProof(user.id, id)).toEqual({ ok: true });
    await settleBackground();
  });
});

describe("AI screening with proof cards", () => {
  it("uses attached proof text as candidate evidence when there is no resume", async () => {
    const user = await createUser("user");
    const organisation = await createUser("organisation");
    const opportunityId = await publishedListing(organisation.id);
    const id = await added(user.id);
    const applied = await applyToOpportunity(user.id, opportunityId, { note: "", proofIds: [id] });
    if (!applied.ok) throw new Error(applied.reason);
    await settleBackground();

    const { prompts } = stubFetch({
      resume: { score: 80, summary: "Strong Canva work.", matchedSkills: ["canva"] },
    });
    const result = await analyzeApplication(applied.id);
    expect(result).toMatchObject({ ok: true, analysis: { resumeScore: 80, overallScore: 80 } });
    const screening = prompts.find((prompt) => prompt.includes("Instagram posts for a sweet shop"));
    expect(screening).toContain("followers went from 200 to 900");
    expect(screening).not.toContain("IIT");
  });
});
