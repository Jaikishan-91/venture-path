import "server-only";
import { getLogger } from "../logger";
import { getLlmConfig, type LlmProviderConfig } from "./config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LlmError {
  message: string;
  status?: number;
}

const logger = getLogger();

/** A configured LLM provider, or null when disabled/unconfigured. */
export type LlmClient = {
  /** Human-readable model identifier for logging. */
  model: string;
  /** Send a chat completion request. Returns null on any failure. */
  chat: (messages: LlmMessage[]) => Promise<string | null>;
};

/**
 * Create an LLM client from the environment configuration.
 * Returns null when the provider is disabled or misconfigured, so callers
 * can degrade gracefully — resume analysis simply stays unavailable.
 */
export function createLlmClient(): LlmClient | null {
  const config = getLlmConfig();
  if (config.kind === "disabled") return null;

  return {
    model: config.model,
    chat: async (messages: LlmMessage[]) => callOpenAiCompatible(config, messages),
  };
}

interface OpenAiCompatibleRequest {
  model: string;
  messages: LlmMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_object" };
}

async function callOpenAiCompatible(
  config: LlmProviderConfig,
  messages: LlmMessage[],
): Promise<string | null> {
  if (!config.baseUrl) {
    logger.warn({ provider: config.kind }, "LLM baseUrl missing; analysis unavailable");
    return null;
  }

  const body: OpenAiCompatibleRequest = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  };

  // Gemini via the OpenAI-compatible endpoint doesn't support response_format;
  // we parse JSON defensively in the caller. OpenAI and Ollama (recent) do.
  if (!config.baseUrl.includes("googleapis.com")) {
    body.response_format = { type: "json_object" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const started = Date.now();
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      logger.warn(
        {
          provider: config.kind,
          model: config.model,
          status: res.status,
          body: text,
        },
        "LLM request failed",
      );
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      logger.warn({ provider: config.kind, model: config.model }, "LLM returned empty content");
      return null;
    }

    logger.info(
      {
        provider: config.kind,
        model: config.model,
        ms: Date.now() - started,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      "LLM request completed",
    );

    return content;
  } catch (err) {
    logger.warn({ provider: config.kind, model: config.model, err }, "LLM request threw");
    return null;
  }
}
