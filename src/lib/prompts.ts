import { getDb } from "./db";
import { getLogger } from "./logger";
import type { PromptKey } from "./llm/prompts";

const logger = getLogger();

export type PromptRow = {
  key: PromptKey;
  name: string;
  content: string;
};

/** Update a prompt's content. `adminId` must come from an admin session. */
export async function updatePrompt(
  adminId: string,
  key: PromptKey,
  content: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const db = getDb();
  const { count } = await db.prompt.updateMany({
    where: { key },
    data: { content, updatedById: adminId },
  });
  if (count === 0) {
    logger.warn({ adminId, key }, "prompt update failed: not found");
    return { ok: false, reason: "not_found" };
  }
  logger.info({ adminId, key }, "prompt updated");
  return { ok: true };
}
