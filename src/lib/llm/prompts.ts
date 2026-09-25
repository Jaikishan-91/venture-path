import "server-only";
import { getDb } from "../db";
import { getLogger } from "../logger";
import { DEFAULT_PROMPTS } from "./defaults";

const logger = getLogger();

/** Stable keys identifying each admin-editable LLM prompt. */
export const PROMPT_KEYS = ["resume_analysis", "job_description"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export interface PromptTemplate {
  key: PromptKey;
  name: string;
  content: string;
}

/** In-code fallback defaults used when the DB has no stored prompt. */
export const DEFAULT_PROMPT_TEMPLATES: Record<PromptKey, { name: string; content: string }> = {
  resume_analysis: {
    name: "Resume Analysis Prompt",
    content: DEFAULT_PROMPTS.resume_analysis,
  },
  job_description: {
    name: "Job Description Prompt",
    content: DEFAULT_PROMPTS.job_description,
  },
};

/** Return all prompts, using the DB row when present and falling back to defaults. */
export async function getAllPrompts(): Promise<PromptTemplate[]> {
  const db = getDb();
  const stored = await db.prompt.findMany({ select: { key: true, name: true, content: true } });

  return PROMPT_KEYS.map((key) => {
    const row = stored.find((s) => s.key === key);
    return row ?? { key, ...DEFAULT_PROMPT_TEMPLATES[key] };
  }) as PromptTemplate[];
}

/** Fetch a single prompt by key, falling back to the default when not stored. */
export async function getPromptContent(key: PromptKey): Promise<string> {
  const found = await getDb().prompt.findUnique({ where: { key }, select: { content: true } });
  return found?.content ?? DEFAULT_PROMPT_TEMPLATES[key].content;
}

/** Replace `{{var}}` placeholders with the provided values. Unknown vars are left as-is. */
export function buildPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = vars[name];
    return value !== undefined ? value : `{{${name}}}`;
  });
}

/** Ensure all default prompts exist in the database (idempotent). */
export async function seedDefaultPrompts(): Promise<void> {
  const db = getDb();
  for (const key of PROMPT_KEYS) {
    const exists = await db.prompt.findUnique({ where: { key }, select: { key: true } });
    if (!exists) {
      const { name, content } = DEFAULT_PROMPT_TEMPLATES[key];
      await db.prompt.create({ data: { key, name, content } });
      logger.info({ key }, "Default prompt seeded");
    }
  }
}
