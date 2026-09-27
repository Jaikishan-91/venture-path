import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { parsePipelineSuggestion, suggestPipeline } from "@/lib/pipeline-assist";

const EMAIL_DOMAIN = "pipeline-assist-test.venturepath.local";

async function createOrganisation() {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Test organisation",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
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

const listing: OpportunityInput = {
  type: "internship",
  title: "Frontend intern",
  description: "Build pages in React.",
  skills: ["react"],
  workMode: "remote",
  city: null,
  payType: "paid",
  payAmount: 10000,
  payPeriod: "month",
  duration: null,
  deadline: null,
  requirements: "Portfolio",
  experienceLevel: "entry",
  compensationMin: null,
  compensationMax: null,
};

async function createListing(userId: string) {
  const result = await createOpportunity(userId, listing);
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

/** Stub the OpenAI-compatible endpoint with a single canned reply. */
function stubLlm(reply: object | string | null) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so `.mock.calls[0][1]` is typed
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    if (reply === null) return new Response("unavailable", { status: 503 });
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

afterEach(disableLlm);

afterEach(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
});

describe("parsePipelineSuggestion", () => {
  it("parses a well-formed reply", () => {
    expect(
      parsePipelineSuggestion(
        JSON.stringify({
          stages: [
            { name: "Screen", kind: "interview", instructions: "Chat", durationMinutes: 30 },
            { name: "Take-home", kind: "assignment", instructions: "Build a thing" },
          ],
        }),
      ),
    ).toEqual({
      stages: [
        {
          name: "Screen",
          kind: "interview",
          instructions: "Chat",
          externalUrl: null,
          durationMinutes: 30,
          source: "ai",
        },
        {
          name: "Take-home",
          kind: "assignment",
          instructions: "Build a thing",
          externalUrl: null,
          durationMinutes: null,
          source: "ai",
        },
      ],
    });
  });

  it("returns null for unparsable content or no usable stages", () => {
    expect(parsePipelineSuggestion("not json")).toBeNull();
    expect(parsePipelineSuggestion(JSON.stringify({ stages: [] }))).toBeNull();
    expect(
      parsePipelineSuggestion(JSON.stringify({ stages: [{ kind: "onboarding" }] })),
    ).toBeNull();
  });

  it("drops stages with a missing name or unknown kind, and empty instructions become null", () => {
    const result = parsePipelineSuggestion(
      JSON.stringify({
        stages: [
          { name: "", kind: "interview" },
          { name: "Good", kind: "onboarding" },
          { name: "Screen", kind: "interview", instructions: "   " },
        ],
      }),
    );
    expect(result?.stages).toEqual([
      {
        name: "Screen",
        kind: "interview",
        instructions: null,
        externalUrl: null,
        durationMinutes: 45,
        source: "ai",
      },
    ]);
  });

  it("dedupes names case-insensitively and clamps to MAX_STAGES", () => {
    const stages = Array.from({ length: 12 }, (_, i) => ({
      name: i === 1 ? "Screen" : `Stage ${i}`,
      kind: "other",
    }));
    stages.push({ name: "screen", kind: "other" }); // duplicate of index 1, different case
    const result = parsePipelineSuggestion(JSON.stringify({ stages }));
    expect(result?.stages.length).toBe(10);
    const names = result!.stages.map((s) => s.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("defaults and clamps duration for interview/test, and forces null for assignment/other", () => {
    const result = parsePipelineSuggestion(
      JSON.stringify({
        stages: [
          { name: "A", kind: "interview" }, // missing -> default
          { name: "B", kind: "test", durationMinutes: 5 }, // too low -> clamped to min
          { name: "C", kind: "test", durationMinutes: 5000 }, // too high -> clamped to max
          { name: "D", kind: "assignment", durationMinutes: 60 }, // ignored -> null
          { name: "E", kind: "other", durationMinutes: 60 }, // ignored -> null
        ],
      }),
    );
    expect(result?.stages.map((s) => s.durationMinutes)).toEqual([45, 15, 480, null, null]);
  });
});

describe("suggestPipeline", () => {
  it("returns not_found for another organisation's listing without calling the LLM", async () => {
    const organisation = await createOrganisation();
    const other = await createOrganisation();
    const id = await createListing(organisation.id);
    const fetchMock = stubLlm({ stages: [{ name: "Screen", kind: "interview" }] });
    expect(await suggestPipeline(other.id, id)).toEqual({ ok: false, reason: "not_found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no_llm when the LLM isn't configured", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    expect(await suggestPipeline(organisation.id, id)).toEqual({ ok: false, reason: "no_llm" });
  });

  it("returns parse_error for an unusable reply, without setting pipelineAssistedAt", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    stubLlm("not json");
    expect(await suggestPipeline(organisation.id, id)).toEqual({
      ok: false,
      reason: "parse_error",
    });
    expect(
      (await getDb().opportunity.findUniqueOrThrow({ where: { id } })).pipelineAssistedAt,
    ).toBeNull();
  });

  it("returns stages, sets pipelineAssistedAt, and persists nothing as stages", async () => {
    const organisation = await createOrganisation();
    const id = await createListing(organisation.id);
    const fetchMock = stubLlm({
      stages: [
        { name: "Screen", kind: "interview", instructions: "Chat", durationMinutes: 30 },
        { name: "Take-home", kind: "assignment" },
      ],
    });

    const result = await suggestPipeline(organisation.id, id);
    expect(result).toMatchObject({
      ok: true,
      stages: [
        expect.objectContaining({ name: "Screen", kind: "interview", source: "ai" }),
        expect.objectContaining({ name: "Take-home", kind: "assignment", source: "ai" }),
      ],
    });
    const prompt = (
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
        messages: { content: string }[];
      }
    ).messages[1].content;
    expect(prompt).toContain("<listing>\nTitle: Frontend intern");

    expect(
      (await getDb().opportunity.findUniqueOrThrow({ where: { id } })).pipelineAssistedAt,
    ).not.toBeNull();
    expect(await getDb().pipelineStage.count({ where: { opportunityId: id } })).toBe(0);
  });
});
