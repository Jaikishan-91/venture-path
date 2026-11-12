import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLlmConfigCache } from "@/lib/llm/config";
import { createLlmClient } from "@/lib/llm/provider";

const saved = { ...process.env };

function useModels(fallback?: string) {
  Object.assign(process.env, {
    LLM_PROVIDER: "openai",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_MODEL: "main-model",
    LLM_FALLBACK_MODEL: fallback ?? "",
  });
  clearLlmConfigCache();
}

/** Replies by model name: a status for a failure, or content for success. */
function stubFetch(replies: Record<string, number | string>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const model = (JSON.parse(init.body) as { model: string }).model;
      calls.push(model);
      const reply = replies[model];
      if (typeof reply === "number") return new Response("busy", { status: reply });
      return Response.json({ choices: [{ message: { content: reply } }] });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
  clearLlmConfigCache();
});

describe("LLM fallback model", () => {
  it("retries once on the fallback model after a rate limit", async () => {
    useModels("backup-model");
    const calls = stubFetch({ "main-model": 429, "backup-model": '{"ok":true}' });
    expect(await createLlmClient()!.chat([{ role: "user", content: "hi" }])).toBe('{"ok":true}');
    expect(calls).toEqual(["main-model", "backup-model"]);
  });

  it("retries after a server error", async () => {
    useModels("backup-model");
    const calls = stubFetch({ "main-model": 503, "backup-model": "done" });
    expect(await createLlmClient()!.chat([{ role: "user", content: "hi" }])).toBe("done");
    expect(calls).toEqual(["main-model", "backup-model"]);
  });

  it("doesn't retry a bad request", async () => {
    useModels("backup-model");
    const calls = stubFetch({ "main-model": 400, "backup-model": "done" });
    expect(await createLlmClient()!.chat([{ role: "user", content: "hi" }])).toBeNull();
    expect(calls).toEqual(["main-model"]);
  });

  it("doesn't call the fallback when the main model answers or none is set", async () => {
    useModels("backup-model");
    let calls = stubFetch({ "main-model": "first" });
    expect(await createLlmClient()!.chat([{ role: "user", content: "hi" }])).toBe("first");
    expect(calls).toEqual(["main-model"]);

    useModels();
    calls = stubFetch({ "main-model": 429 });
    expect(await createLlmClient()!.chat([{ role: "user", content: "hi" }])).toBeNull();
    expect(calls).toEqual(["main-model"]);
  });
});
