import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const llmConfigSchema = z.object({
  /** "disabled" = no LLM calls; "openai" = any OpenAI-compatible endpoint. */
  LLM_PROVIDER: z.enum(["disabled", "openai"]).default("disabled"),
  /** Base URL for an OpenAI-compatible endpoint. */
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  /** API key for the OpenAI-compatible endpoint. Not needed for Ollama. */
  LLM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Model name (e.g. "gpt-4o-mini", "llama3.1:8b", "gemini-2.0-flash"). */
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Optional fallback model name. */
  LLM_FALLBACK_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Max tokens for LLM responses. */
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  /** Temperature for LLM responses. */
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
});

export type LlmConfig = z.infer<typeof llmConfigSchema>;

export type LlmProviderKind = "disabled" | "openai";

export interface LlmProviderConfig {
  kind: LlmProviderKind;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  fallbackModel?: string;
  maxTokens: number;
  temperature: number;
}

const FALLBACK_MODEL = "gpt-3.5-turbo";

let cached: LlmProviderConfig | undefined;

export function getLlmConfig(): LlmProviderConfig {
  if (cached) return cached;

  const result = llmConfigSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid LLM configuration: ${problems}`);
  }

  const env = result.data;

  if (env.LLM_PROVIDER === "openai") {
    if (!env.LLM_BASE_URL) {
      throw new Error("LLM_BASE_URL is required when LLM_PROVIDER=openai");
    }
    cached = {
      kind: "openai",
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL ?? FALLBACK_MODEL,
      fallbackModel: env.LLM_FALLBACK_MODEL,
      maxTokens: env.LLM_MAX_TOKENS,
      temperature: env.LLM_TEMPERATURE,
    };
  } else {
    cached = {
      kind: "disabled",
      model: "",
      fallbackModel: undefined,
      maxTokens: env.LLM_MAX_TOKENS,
      temperature: env.LLM_TEMPERATURE,
    };
  }

  return cached;
}

/** Clear the cached config, primarily for tests. */
export function clearLlmConfigCache(): void {
  cached = undefined;
}
