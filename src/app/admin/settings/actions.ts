"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { updatePrompt } from "@/lib/prompts";
import type { PromptKey } from "@/lib/llm/prompts";
import { PROMPT_KEYS } from "@/lib/llm/prompts";

export type SettingsFormState = { status: "idle" } | { status: "error"; message: string };

const MAX_PROMPT_LENGTH = 10_000;

export async function savePromptAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const session = await requireRole("admin");
  const key = formData.get("key");
  const content = formData.get("content");

  if (typeof key !== "string" || !(PROMPT_KEYS as readonly string[]).includes(key)) {
    return { status: "error", message: "Unknown prompt key" };
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return { status: "error", message: "Prompt content cannot be empty" };
  }
  if (content.length > MAX_PROMPT_LENGTH) {
    return { status: "error", message: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer` };
  }

  try {
    const result = await updatePrompt(session.user.id, key as PromptKey, content.trim());
    if (!result.ok) return { status: "error", message: "Prompt not found" };
  } catch (err) {
    getLogger().error({ adminId: session.user.id, key, err }, "prompt save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/settings");
  return { status: "idle" };
}
