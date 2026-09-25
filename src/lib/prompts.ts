import { getDb } from "./db";
import { getLogger } from "./logger";
import { DEFAULT_PROMPT_TEMPLATES, type PromptKey } from "./llm/prompts";

const logger = getLogger();

/** Save a prompt's content, creating the row if it is missing. `adminId` must come from an admin session. */
export async function updatePrompt(
  adminId: string,
  key: PromptKey,
  content: string,
): Promise<void> {
  await getDb().prompt.upsert({
    where: { key },
    create: { key, name: DEFAULT_PROMPT_TEMPLATES[key].name, content, updatedById: adminId },
    update: { content, updatedById: adminId },
  });
  logger.info({ adminId, key }, "prompt updated");
}
