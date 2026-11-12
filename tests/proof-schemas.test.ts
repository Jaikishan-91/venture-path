import { describe, expect, it } from "vitest";
import {
  applyTaskSchema,
  levelAfterCheck,
  parseProofIds,
  parseTaskAnswer,
  proofEvidenceText,
  proofSchema,
  sortByProofLevel,
} from "@/lib/proof-schemas";
import {
  MAX_APPLICATION_PROOFS,
  MAX_APPLY_TASK_ANSWER_LENGTH,
  MAX_APPLY_TASK_LENGTH,
  MAX_PROOF_SKILLS,
  MAX_PROOF_WHAT_I_DID_LENGTH,
} from "@/lib/v2/types";

const valid = {
  title: " Instagram posts for a sweet shop ",
  link: "https://instagram.com/sharmasweets",
  whatIDid: "Wrote 30 posts and designed them in Canva.",
  skills: "Canva, content writing, canva, ",
};

describe("proofSchema", () => {
  it("trims, normalises and de-duplicates skills", () => {
    expect(proofSchema.parse(valid)).toEqual({
      title: "Instagram posts for a sweet shop",
      link: "https://instagram.com/sharmasweets",
      whatIDid: "Wrote 30 posts and designed them in Canva.",
      skills: ["canva", "content writing"],
    });
  });

  it("treats an empty link as none", () => {
    expect(proofSchema.parse({ ...valid, link: "  " }).link).toBeNull();
  });

  it("accepts only http and https links with a real host", () => {
    for (const link of [
      "javascript:alert(1)",
      "ftp://example.com/x",
      "file:///etc/passwd",
      "not a url",
      "http://localhost/x",
    ]) {
      expect(proofSchema.safeParse({ ...valid, link }).success, link).toBe(false);
    }
    expect(proofSchema.safeParse({ ...valid, link: "http://github.com/a/b" }).success).toBe(true);
  });

  it("enforces required fields and limits", () => {
    expect(proofSchema.safeParse({ ...valid, title: " " }).success).toBe(false);
    expect(proofSchema.safeParse({ ...valid, whatIDid: "" }).success).toBe(false);
    expect(
      proofSchema.safeParse({ ...valid, whatIDid: "x".repeat(MAX_PROOF_WHAT_I_DID_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(proofSchema.safeParse({ ...valid, skills: " , " }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_PROOF_SKILLS + 1 }, (_, i) => `skill${i}`).join(",");
    expect(proofSchema.safeParse({ ...valid, skills: tooMany }).success).toBe(false);
  });

  it("ignores a level or AI fields sent with the form", () => {
    const parsed = proofSchema.parse({ ...valid, level: "verified", aiScore: 5 });
    expect(parsed).not.toHaveProperty("level");
    expect(parsed).not.toHaveProperty("aiScore");
  });
});

describe("apply task and proof picks", () => {
  it("parses the listing's apply task", () => {
    expect(applyTaskSchema.parse("  ")).toBeNull();
    expect(applyTaskSchema.parse(" Write 3 captions ")).toBe("Write 3 captions");
    expect(applyTaskSchema.safeParse("x".repeat(MAX_APPLY_TASK_LENGTH + 1)).success).toBe(false);
  });

  it("requires a task answer within the limit", () => {
    expect(parseTaskAnswer("  ")).toMatchObject({ ok: false });
    expect(parseTaskAnswer(null)).toMatchObject({ ok: false });
    expect(parseTaskAnswer("x".repeat(MAX_APPLY_TASK_ANSWER_LENGTH + 1))).toMatchObject({
      ok: false,
    });
    expect(parseTaskAnswer(" done ")).toEqual({ ok: true, answer: "done" });
  });

  it("de-duplicates proof IDs and caps them", () => {
    expect(parseProofIds(["a", "a", "b", ""])).toEqual({ ok: true, ids: ["a", "b"] });
    const ids = Array.from({ length: MAX_APPLICATION_PROOFS + 1 }, (_, i) => `id${i}`);
    expect(parseProofIds(ids)).toMatchObject({ ok: false });
  });
});

describe("levels", () => {
  it("sorts strongest badge first, then newest", () => {
    const at = (day: number) => new Date(Date.UTC(2026, 0, day));
    const sorted = sortByProofLevel([
      { id: "a", level: "added" as const, createdAt: at(3) },
      { id: "v", level: "verified" as const, createdAt: at(1) },
      { id: "c1", level: "checked" as const, createdAt: at(1) },
      { id: "c2", level: "checked" as const, createdAt: at(2) },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["v", "c2", "c1", "a"]);
  });

  it("gives 🔵 only when the evidence opens and the score passes", () => {
    const base = { hasLink: true, linkReachable: true, hasFile: false, score: 3 };
    expect(levelAfterCheck(base)).toBe("checked");
    expect(levelAfterCheck({ ...base, score: 2 })).toBe("added");
    expect(levelAfterCheck({ ...base, score: null })).toBe("added");
    expect(levelAfterCheck({ ...base, linkReachable: false })).toBe("added");
    // A file still doesn't rescue a dead link.
    expect(levelAfterCheck({ ...base, linkReachable: false, hasFile: true })).toBe("added");
    expect(levelAfterCheck({ ...base, hasLink: false, linkReachable: false, hasFile: true })).toBe(
      "checked",
    );
    expect(levelAfterCheck({ ...base, hasLink: false, linkReachable: false })).toBe("added");
  });

  it("formats proof cards as evidence text", () => {
    expect(
      proofEvidenceText([{ title: "Shop posts", whatIDid: "Wrote posts", skills: ["canva"] }]),
    ).toBe("Proof 1: Shop posts\nWhat I did: Wrote posts\nSkills: canva");
  });
});
