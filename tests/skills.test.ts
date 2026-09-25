import { describe, expect, it } from "vitest";
import {
  combineScores,
  matchScore,
  MATCH_THRESHOLD,
  mergeSkills,
  normalizeSkill,
  normalizeSkills,
  parseScore,
  skillCoverage,
} from "@/lib/skills";

describe("normalizeSkill", () => {
  it("lowercases, trims, collapses whitespace and applies aliases", () => {
    expect(normalizeSkill("  React.js ")).toBe("react");
    expect(normalizeSkill("ReactJS")).toBe("react");
    expect(normalizeSkill("Node")).toBe("node.js");
    expect(normalizeSkill("Social   Media  Marketing")).toBe("social media marketing");
  });

  it("keeps meaningful symbols and strips surrounding punctuation", () => {
    expect(normalizeSkill("C++")).toBe("c++");
    expect(normalizeSkill("C#")).toBe("c#");
    expect(normalizeSkill("- SQL,")).toBe("sql");
    expect(normalizeSkill(".NET")).toBe(".net");
  });

  it("caps the length", () => {
    expect(normalizeSkill("x".repeat(60))).toHaveLength(40);
  });
});

describe("normalizeSkills / mergeSkills", () => {
  it("drops non-strings, blanks and duplicates, keeping first-seen order", () => {
    expect(normalizeSkills(["React", 3, "", "reactjs", "SQL"], 10)).toEqual(["react", "sql"]);
  });

  it("caps the list", () => {
    expect(normalizeSkills(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("keeps the organisation's skills first and only adds new suggestions", () => {
    expect(mergeSkills(["figma", "canva"], ["Canva", "Photoshop"], 15)).toEqual([
      "figma",
      "canva",
      "photoshop",
    ]);
    expect(mergeSkills(["a", "b"], ["c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
});

describe("skillCoverage", () => {
  it("is the share of required skills the candidate has, after normalisation", () => {
    expect(skillCoverage(["react", "sql", "figma", "git"], ["ReactJS", "SQL"])).toEqual({
      coverage: 0.5,
      matched: ["react", "sql"],
    });
  });

  it("is 0 when the listing has no skills", () => {
    expect(skillCoverage([], ["react"])).toEqual({ coverage: 0, matched: [] });
  });
});

describe("matchScore", () => {
  it("weights coverage 70% and similarity 30%, clamped to 0–1", () => {
    expect(matchScore(1, 1)).toBeCloseTo(1);
    expect(matchScore(0.5, 0)).toBeCloseTo(0.35);
    expect(matchScore(2, -1)).toBeCloseTo(0.7);
  });

  it("does not recommend a listing on weak semantic similarity alone", () => {
    expect(matchScore(0, 0.5)).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe("combineScores", () => {
  it("weights resume 60% and answers 40% when both exist", () => {
    expect(combineScores(80, 50)).toBe(68);
  });

  it("uses whichever part exists, else null", () => {
    expect(combineScores(72, null)).toBe(72);
    expect(combineScores(null, 64)).toBe(64);
    expect(combineScores(null, null)).toBeNull();
  });
});

describe("parseScore", () => {
  it("accepts numbers and numeric strings in 0–100, rounded", () => {
    expect(parseScore(72.5)).toBe(73);
    expect(parseScore("40")).toBe(40);
    expect(parseScore(0)).toBe(0);
  });

  it("rejects anything else", () => {
    for (const value of [101, -1, "high", null, undefined, "", Number.NaN, {}]) {
      expect(parseScore(value)).toBeNull();
    }
  });
});
