import { describe, expect, it } from "vitest";
import {
  CHAR_COUNT_THRESHOLD,
  clearDraft,
  draftKey,
  isSendKey,
  loadDraft,
  questionNumber,
  saveDraft,
  showCharCount,
} from "@/lib/interview-room";
import { MAX_INTERVIEW_ANSWER_LENGTH } from "@/lib/v2/types";

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("draft storage", () => {
  it("keys drafts per interview without storing the secret token", () => {
    expect(draftKey(TOKEN)).toMatch(/^vp-interview-draft:[0-9a-z]+$/);
    expect(draftKey(TOKEN)).not.toContain(TOKEN);
    expect(draftKey(TOKEN)).toBe(draftKey(TOKEN));
    expect(draftKey(TOKEN)).not.toBe(draftKey(`${TOKEN}x`));
  });

  it("restores the draft for the same question only", () => {
    const storage = memoryStorage();
    saveDraft(storage, TOKEN, 3, "I made reels");
    expect(loadDraft(storage, TOKEN, 3)).toBe("I made reels");
    // The interview moved on (another tab, or the answer was sent): the old draft is ignored.
    expect(loadDraft(storage, TOKEN, 5)).toBe("");
    expect(loadDraft(storage, `${TOKEN}x`, 3)).toBe("");
  });

  it("removes the draft when blank or cleared", () => {
    const storage = memoryStorage();
    saveDraft(storage, TOKEN, 1, "draft");
    saveDraft(storage, TOKEN, 1, "   ");
    expect(storage.map.size).toBe(0);
    saveDraft(storage, TOKEN, 1, "draft");
    clearDraft(storage, TOKEN);
    expect(loadDraft(storage, TOKEN, 1)).toBe("");
  });

  it("never throws: blocked storage, no storage and broken entries", () => {
    expect(() => saveDraft(throwing, TOKEN, 1, "x")).not.toThrow();
    expect(() => clearDraft(throwing, TOKEN)).not.toThrow();
    expect(loadDraft(throwing, TOKEN, 1)).toBe("");
    expect(loadDraft(null, TOKEN, 1)).toBe("");
    const storage = memoryStorage();
    storage.setItem(draftKey(TOKEN), "{not json");
    expect(loadDraft(storage, TOKEN, 1)).toBe("");
    storage.setItem(draftKey(TOKEN), JSON.stringify({ turns: 1, text: 42 }));
    expect(loadDraft(storage, TOKEN, 1)).toBe("");
  });

  it("caps a restored draft at the answer limit", () => {
    const storage = memoryStorage();
    storage.setItem(draftKey(TOKEN), JSON.stringify({ turns: 1, text: "a".repeat(5000) }));
    expect(loadDraft(storage, TOKEN, 1)).toHaveLength(MAX_INTERVIEW_ANSWER_LENGTH);
  });
});

describe("isSendKey", () => {
  it("sends on Enter, not on Shift/Alt+Enter or other keys", () => {
    expect(isSendKey({ key: "Enter", shiftKey: false })).toBe(true);
    expect(isSendKey({ key: "Enter", shiftKey: false, metaKey: true } as never)).toBe(true);
    expect(isSendKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(isSendKey({ key: "Enter", shiftKey: false, altKey: true })).toBe(false);
    expect(isSendKey({ key: "a", shiftKey: false })).toBe(false);
  });

  it("never sends while an input method is composing", () => {
    expect(isSendKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
    expect(isSendKey({ key: "Enter", shiftKey: false, keyCode: 229 })).toBe(false);
  });
});

describe("room display helpers", () => {
  it("shows the character count only near the limit", () => {
    expect(showCharCount(0)).toBe(false);
    expect(showCharCount(CHAR_COUNT_THRESHOLD - 1)).toBe(false);
    expect(showCharCount(CHAR_COUNT_THRESHOLD)).toBe(true);
    expect(CHAR_COUNT_THRESHOLD).toBeLessThan(MAX_INTERVIEW_ANSWER_LENGTH);
  });

  it("numbers questions from 1 and never past the last", () => {
    expect(questionNumber(0, 6)).toBe(1);
    expect(questionNumber(5, 6)).toBe(6);
    expect(questionNumber(6, 6)).toBe(6);
  });
});
