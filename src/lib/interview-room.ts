import { MAX_INTERVIEW_ANSWER_LENGTH } from "./v2/types";

/**
 * Pure helpers for the student's interview room (`/interview/[token]`). No server or DOM imports,
 * so they are safe in client components and unit tests.
 */

/** Show the character count only once the answer is this close to the limit. */
export const CHAR_COUNT_THRESHOLD = Math.round(MAX_INTERVIEW_ANSWER_LENGTH * 0.8);

export const showCharCount = (length: number) => length >= CHAR_COUNT_THRESHOLD;

/**
 * localStorage key for the unsent draft. The invite token is a secret, so only a short hash of it
 * is used (FNV-1a, enough to keep drafts of different interviews apart).
 */
export function draftKey(token: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `vp-interview-draft:${hash.toString(36)}`;
}

/** Minimal Storage surface, so tests can pass a fake and the browser can pass localStorage. */
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The draft saved for this question, identified by the transcript length the page showed when
 * it was typed. A draft from an earlier question (or a broken entry) is ignored.
 */
export function loadDraft(storage: DraftStorage | null, token: string, turns: number): string {
  try {
    const raw = storage?.getItem(draftKey(token));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { turns?: unknown; text?: unknown };
    return parsed.turns === turns && typeof parsed.text === "string"
      ? parsed.text.slice(0, MAX_INTERVIEW_ANSWER_LENGTH)
      : "";
  } catch {
    return "";
  }
}

/** Save (or, for blank text, remove) the draft. Storage errors (private mode, full) are ignored. */
export function saveDraft(
  storage: DraftStorage | null,
  token: string,
  turns: number,
  text: string,
): void {
  try {
    if (!text.trim()) storage?.removeItem(draftKey(token));
    else storage?.setItem(draftKey(token), JSON.stringify({ turns, text }));
  } catch {
    // A draft is a convenience only.
  }
}

export function clearDraft(storage: DraftStorage | null, token: string): void {
  try {
    storage?.removeItem(draftKey(token));
  } catch {
    // Ignore.
  }
}

/** localStorage when the browser allows it, else null. */
export function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Enter (or Ctrl/Cmd+Enter) sends, Shift+Enter or Alt+Enter makes a new line. Never while an
 * input method (e.g. a Hindi keyboard) is still composing text.
 */
export function isSendKey(event: {
  key: string;
  shiftKey: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.altKey) return false;
  // 229 = the key event that belongs to an IME composition (Safari doesn't set isComposing).
  return !event.isComposing && event.keyCode !== 229;
}

/** The question number to show (1-based, never past the last question). */
export function questionNumber(currentIndex: number, questionCount: number): number {
  return Math.max(1, Math.min(currentIndex + 1, questionCount));
}
