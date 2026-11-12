import { describe, expect, it } from "vitest";
import {
  challengeSchema,
  compareByScore,
  daysLeft,
  daysLeftLabel,
  deadlineFromIndiaDate,
  effectiveStatus,
  formatReward,
  hireOfferSchema,
  indiaDateOfDeadline,
  parseCriteria,
  readBreakdown,
  studentResultLabel,
  submissionSchema,
  totalScore,
} from "@/lib/challenge-schemas";

const TODAY = "2026-11-12";
const base = {
  title: "Our Instagram gets no customers",
  problem: "We post every day but nobody visits the shop.",
  goodSolution: "",
  criteria: ["Practical", "", "Cheap"],
  rewardMoney: "2000",
  rewardHire: undefined as string | undefined,
  deadline: "2026-11-20",
};
const parse = (overrides: Partial<typeof base> = {}) =>
  challengeSchema(TODAY).safeParse({ ...base, ...overrides });

describe("challengeSchema", () => {
  it("parses a money challenge and drops blank judging points", () => {
    const result = parse();
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      rewardMoneyInr: 2000,
      rewardHire: false,
      goodSolution: null,
      criteria: ["Practical", "Cheap"],
    });
    expect(result.data?.deadline.toISOString()).toBe("2026-11-20T18:29:59.999Z");
  });

  it("requires a reward: money, hiring or both", () => {
    const none = parse({ rewardMoney: "" });
    expect(none.success).toBe(false);
    expect(none.error?.issues[0].message).toMatch(/Add a reward/);
    expect(parse({ rewardMoney: "", rewardHire: "on" }).data).toMatchObject({
      rewardMoneyInr: null,
      rewardHire: true,
    });
    expect(parse({ rewardHire: "on" }).data).toMatchObject({
      rewardMoneyInr: 2000,
      rewardHire: true,
    });
  });

  it("rejects bad money amounts", () => {
    for (const rewardMoney of ["0", "-5", "12.5", "abc", "100000000"]) {
      expect(parse({ rewardMoney }).success).toBe(false);
    }
  });

  it("rejects past, missing and impossible deadlines but accepts today", () => {
    expect(parse({ deadline: "2026-11-11" }).success).toBe(false);
    expect(parse({ deadline: "" }).success).toBe(false);
    expect(parse({ deadline: "2026-02-30" }).success).toBe(false);
    expect(parse({ deadline: TODAY }).success).toBe(true);
  });

  it("limits judging points to three", () => {
    expect(parse({ criteria: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("parseCriteria", () => {
  it("trims, collapses spaces and drops duplicates", () => {
    expect(parseCriteria(["  Clear  idea ", "clear idea", "Cheap"])).toEqual({
      ok: true,
      criteria: ["Clear idea", "Cheap"],
    });
  });
  it("rejects over-long points", () => {
    expect(parseCriteria(["x".repeat(201)]).ok).toBe(false);
  });
});

describe("deadlines in India time", () => {
  it("round-trips the date", () => {
    expect(indiaDateOfDeadline(deadlineFromIndiaDate("2026-12-31"))).toBe("2026-12-31");
  });
  it("counts days left and the open→judging switch", () => {
    const deadline = deadlineFromIndiaDate("2026-11-14");
    const now = new Date("2026-11-12T06:00:00Z");
    expect(daysLeft(deadline, now)).toBe(3);
    expect(daysLeftLabel(deadline, now)).toBe("3 days left");
    expect(daysLeftLabel(deadline, new Date("2026-11-14T10:00:00Z"))).toBe("Last day");
    const after = new Date("2026-11-14T18:30:00Z");
    expect(daysLeftLabel(deadline, after)).toBe("Closed");
    expect(effectiveStatus("open", deadline, after)).toBe("judging");
    expect(effectiveStatus("open", deadline, now)).toBe("open");
    expect(effectiveStatus("draft", deadline, after)).toBe("draft");
  });
});

describe("submission and hire schemas", () => {
  it("accepts text with an optional https link", () => {
    expect(submissionSchema.parse({ text: " Idea ", link: "" })).toEqual({
      text: "Idea",
      link: null,
    });
    expect(submissionSchema.safeParse({ text: "Idea", link: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(submissionSchema.safeParse({ text: "   ", link: "" }).success).toBe(false);
    expect(submissionSchema.parse({ text: "Idea", link: "https://example.com/x" }).link).toBe(
      "https://example.com/x",
    );
  });
  it("validates the hire offer", () => {
    expect(hireOfferSchema.parse({ message: " Join us ", opportunityId: "" })).toEqual({
      message: "Join us",
      opportunityId: null,
    });
    expect(hireOfferSchema.safeParse({ message: "", opportunityId: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});

describe("scores and labels", () => {
  it("computes the 0–10 total from 0–5 points", () => {
    expect(totalScore([])).toBeNull();
    expect(
      totalScore([
        { criterion: "a", score: 5, quote: "" },
        { criterion: "b", score: 4, quote: "" },
        { criterion: "c", score: 3, quote: "" },
      ]),
    ).toBe(8);
    expect(totalScore([{ criterion: "a", score: 0, quote: "" }])).toBe(0);
  });

  it("reads stored breakdowns defensively", () => {
    expect(readBreakdown(null)).toEqual([]);
    expect(readBreakdown([{ criterion: "a", score: 3 }, { bad: true }])).toEqual([
      { criterion: "a", score: 3, quote: "" },
    ]);
  });

  it("sorts highest score first and unscored last", () => {
    const at = (s: string) => new Date(`2026-11-12T${s}:00Z`);
    const rows = [
      { id: "unscored", aiScore: null, submittedAt: at("01:00") },
      { id: "low", aiScore: 3, submittedAt: at("02:00") },
      { id: "high-late", aiScore: 9, submittedAt: at("04:00") },
      { id: "high-early", aiScore: 9, submittedAt: at("03:00") },
    ];
    expect(rows.sort(compareByScore).map((row) => row.id)).toEqual([
      "high-early",
      "high-late",
      "low",
      "unscored",
    ]);
  });

  it("formats rewards and student results without scores", () => {
    expect(formatReward({ rewardMoneyInr: 2000, rewardHire: true })).toBe("₹2,000 + Hiring");
    expect(formatReward({ rewardMoneyInr: null, rewardHire: true })).toBe("Hiring");
    expect(studentResultLabel("done", "winner")).toBe("Winner");
    expect(studentResultLabel("judging", "runner_up")).toBe("Runner-up");
    expect(studentResultLabel("done", "none")).toBe("Not selected");
    expect(studentResultLabel("judging", "none")).toBe("Being judged");
    expect(studentResultLabel("open", "none")).toBeNull();
  });
});
