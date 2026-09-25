import { z } from "zod";
import { getLogger } from "../logger";

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

const disabled = (maxTokens = 1024, temperature = 0.3): LlmProviderConfig => ({
  kind: "disabled",
  model: "",
  maxTokens,
  temperature,
});

/**
 * Read the LLM settings from the environment. An invalid configuration is logged and
 * treated as disabled: AI features are optional and must never break a page.
 */
export function getLlmConfig(): LlmProviderConfig {
  if (cached) return cached;

  const result = llmConfigSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    getLogger().warn({ problems }, "Invalid LLM configuration; AI features disabled");
    cached = disabled();
    return cached;
  }

  const env = result.data;

  if (env.LLM_PROVIDER === "openai") {
    if (!env.LLM_BASE_URL) {
      getLogger().warn("LLM_BASE_URL is required when LLM_PROVIDER=openai; AI features disabled");
      cached = disabled(env.LLM_MAX_TOKENS, env.LLM_TEMPERATURE);
      return cached;
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
    cached = disabled(env.LLM_MAX_TOKENS, env.LLM_TEMPERATURE);
  }

  return cached;
}

/** Clear the cached config, primarily for tests. */
export function clearLlmConfigCache(): void {
  cached = undefined;
}
