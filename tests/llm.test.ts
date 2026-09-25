import { afterEach, describe, expect, it } from "vitest";
import { clearLlmConfigCache, getLlmConfig } from "@/lib/llm/config";
import { buildPrompt } from "@/lib/llm/prompts";
import { parseAnalysisOutput } from "@/lib/resume-analysis";

const saved = { ...process.env };

function setEnv(values: Record<string, string>) {
  Object.assign(process.env, values);
  clearLlmConfigCache();
}

afterEach(() => {
  process.env = { ...saved };
  clearLlmConfigCache();
});

describe("getLlmConfig", () => {
  it("is disabled by default", () => {
    setEnv({ LLM_PROVIDER: "disabled" });
    expect(getLlmConfig().kind).toBe("disabled");
  });

  it("reads an OpenAI-compatible endpoint", () => {
    setEnv({
      LLM_PROVIDER: "openai",
      LLM_BASE_URL: "http://llm.test/v1",
      LLM_API_KEY: "key",
      LLM_MODEL: "small-model",
      LLM_MAX_TOKENS: "500",
    });
    expect(getLlmConfig()).toMatchObject({
      kind: "openai",
      baseUrl: "http://llm.test/v1",
      apiKey: "key",
      model: "small-model",
      maxTokens: 500,
    });
  });

  it("treats an unknown provider as disabled instead of throwing", () => {
    setEnv({ LLM_PROVIDER: "enabled" });
    expect(getLlmConfig().kind).toBe("disabled");
  });

  it("treats openai without a base URL as disabled", () => {
    setEnv({ LLM_PROVIDER: "openai", LLM_BASE_URL: "" });
    expect(getLlmConfig().kind).toBe("disabled");
  });
});

describe("buildPrompt", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(buildPrompt("{{title}} / {{other}}", { title: "Intern" })).toBe("Intern / {{other}}");
  });
});

describe("parseAnalysisOutput", () => {
  it("reads fenced JSON and rounds the score", () => {
    const content =
      '```json\n{"score": 72.6, "summary": " Good fit. ", "matchedSkills": ["react"], "missingSkills": []}\n```';
    expect(parseAnalysisOutput(content)).toEqual({
      score: 73,
      summary: "Good fit.",
      matchedSkills: ["react"],
      missingSkills: [],
    });
  });

  it("accepts a numeric string score", () => {
    expect(parseAnalysisOutput('{"score": "40"}')?.score).toBe(40);
  });

  it("rejects out-of-range scores and non-JSON", () => {
    expect(parseAnalysisOutput('{"score": 140}')).toBeNull();
    expect(parseAnalysisOutput('{"summary": "no score"}')).toBeNull();
    expect(parseAnalysisOutput("I think they are great")).toBeNull();
  });
});
