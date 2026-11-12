import { describe, expect, it } from "vitest";
import {
  answerInputSchema,
  computeRecommendation,
  fallbackQuestions,
  parseEvidence,
  parseFollowUp,
  parseQuestionPlan,
  parseReport,
  quoteInAnswers,
  reportSkills,
  safeNextPath,
} from "@/lib/ai-interview-schemas";
import { parsePipelineSuggestion } from "@/lib/pipeline-assist";
import { parsePipelineStages } from "@/lib/pipeline-schemas";
import { parseScheduleInput } from "@/lib/scheduling-schemas";
import { MAX_INTERVIEW_ANSWER_LENGTH } from "@/lib/v2/types";

const plan = (kinds: string[]) =>
  JSON.stringify({
    questions: kinds.map((kind, index) => ({ text: `Question ${index}?`, kind, skill: "SEO" })),
  });
const GOOD_KINDS = ["skill", "skill", "proof", "proof", "situation", "motivation"];

describe("parseQuestionPlan", () => {
  it("accepts exactly 6 questions in the 2/2/1/1 mix and assigns ids", () => {
    const questions = parseQuestionPlan("```json\n" + plan(GOOD_KINDS) + "\n```");
    expect(questions).toHaveLength(6);
    expect(questions!.map((question) => question.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    expect(questions![0]).toMatchObject({ kind: "skill", skill: "SEO" });
    expect(questions![4].skill).toBe("Problem solving");
    expect(questions![5].skill).toBe("Motivation & availability");
  });

  it("rejects wrong counts, mixes, kinds and over-long text", () => {
    expect(parseQuestionPlan(plan(GOOD_KINDS.slice(0, 5)))).toBeNull();
    expect(
      parseQuestionPlan(plan(["skill", "skill", "skill", "proof", "situation", "motivation"])),
    ).toBeNull();
    expect(
      parseQuestionPlan(plan(["skill", "skill", "proof", "proof", "situation", "trivia"])),
    ).toBeNull();
    const long = JSON.parse(plan(GOOD_KINDS));
    long.questions[0].text = "x".repeat(400);
    expect(parseQuestionPlan(JSON.stringify(long))).toBeNull();
    expect(parseQuestionPlan("not json")).toBeNull();
  });

  it("fills a missing skill with the fallback", () => {
    const raw = JSON.parse(plan(GOOD_KINDS));
    delete raw.questions[0].skill;
    expect(parseQuestionPlan(JSON.stringify(raw), "Canva")![0].skill).toBe("Canva");
  });
});

describe("parseFollowUp", () => {
  it("returns the follow-up or null", () => {
    expect(parseFollowUp('{"followUp":"What was the result?"}')).toBe("What was the result?");
    expect(parseFollowUp('{"followUp":null}')).toBeNull();
    expect(parseFollowUp('{"followUp":""}')).toBeNull();
    expect(parseFollowUp("nope")).toBeNull();
  });
});

describe("fallbackQuestions", () => {
  const ROOM_ORDER = ["skill", "proof", "skill", "proof", "situation", "motivation"];
  const shop = {
    title: "Social media intern",
    skills: ["Instagram", "Canva"],
    businessName: "Sweet Shop",
  };
  const diwali = { title: "Diwali campaign", whatIDid: "Ran posts", skills: ["Instagram"] };
  const menu = { title: "Cafe menu redesign", whatIDid: "Designed it", skills: ["Canva"] };

  const isValidPlan = (questions: { text: string; kind: string }[]) =>
    parseQuestionPlan(JSON.stringify({ questions })) !== null;

  it("opens with the business and role, then alternates proof and skill questions", () => {
    const questions = fallbackQuestions(shop, [diwali, menu]);
    expect(questions.map((question) => question.kind)).toEqual(ROOM_ORDER);
    expect(questions[0].text).toContain("Sweet Shop");
    expect(questions[0].text).toContain("Social media intern");
    expect(questions[0].text).toContain("Instagram");
    expect(questions[0].text).not.toMatch(/what skills would you bring/i);
    expect(questions[1].text).toContain('"Diwali campaign"');
    expect(questions[2].text).toContain("Canva");
    expect(questions[3].text).toContain('"Cafe menu redesign"');
    expect(questions[3].text).toContain("Sweet Shop");
    expect(questions[4].text).toContain("Sweet Shop");
    expect(questions[5].text).toMatch(/hours a week/);
    expect(questions.map((question) => question.skill)).toEqual([
      "Instagram",
      "Instagram",
      "Canva",
      "Canva",
      "Problem solving",
      "Motivation & availability",
    ]);
  });

  it("asks both proof questions about the only proof card", () => {
    const questions = fallbackQuestions(shop, [diwali]);
    expect(questions[1].text).toContain('"Diwali campaign"');
    expect(questions[3].text).toContain('"Diwali campaign"');
    expect(questions[3].text).not.toBe(questions[1].text);
  });

  it("always passes the plan validation (2/2/1/1, ≤ 300 chars), with or without proofs", () => {
    for (const proofs of [[], [diwali], [diwali, menu]]) {
      const questions = fallbackQuestions(shop, proofs);
      expect(isValidPlan(questions)).toBe(true);
      expect(new Set(questions.map((question) => question.id)).size).toBe(6);
    }
  });

  it("works with no skills and no proofs", () => {
    const questions = fallbackQuestions({ title: "Intern", skills: [], businessName: "Acme" });
    expect(questions).toHaveLength(6);
    expect(questions[0].text).toContain("Acme");
    expect(isValidPlan(questions)).toBe(true);
    expect(reportSkills(questions)).toEqual([
      "Role skills",
      "Problem solving",
      "Motivation & availability",
    ]);
  });
});

describe("interview prompts", () => {
  it("ask for the 2/2/1/1 JSON shape and a business-specific opener; follow-ups stay rare", async () => {
    const { INTERVIEW_PROMPTS } = await import("@/lib/llm/defaults-v2/interview");
    const questions = INTERVIEW_PROMPTS.interview_questions;
    for (const placeholder of ["{{questionCount}}", "{{listing}}", "{{proofs}}"]) {
      expect(questions).toContain(placeholder);
    }
    expect(questions).toContain(
      '{"questions": [{"text": "...", "kind": "skill", "skill": "..."}]}',
    );
    expect(questions).toMatch(/opening question/);
    expect(questions).toMatch(/double quotes/);
    const followUp = INTERVIEW_PROMPTS.interview_followup;
    for (const placeholder of ["{{title}}", "{{question}}", "{{answer}}"]) {
      expect(followUp).toContain(placeholder);
    }
    expect(followUp).toContain('{"followUp": null}');
    expect(followUp).toMatch(/Never hint at a good answer/);
  });
});

const answers = [
  "I wrote 30 posts for my uncle’s sweet shop and sales went up.",
  "I can give 20 hours a week.",
];

describe("quotes", () => {
  it("matches quotes case- and whitespace-insensitively, ignoring wrapping quote marks", () => {
    expect(quoteInAnswers('"I wrote 30  posts for my UNCLE\'S sweet shop"', answers)).toBe(true);
    expect(quoteInAnswers("I managed a team of 50", answers)).toBe(false);
    expect(quoteInAnswers("I", answers)).toBe(false);
  });

  it("parseEvidence keeps known skills and real quotes only", () => {
    const evidence = parseEvidence(
      JSON.stringify({
        evidence: [
          {
            skill: "content writing",
            quotes: ["I wrote 30 posts for my uncle's sweet shop", "I am an expert"],
          },
          { skill: "Hacking", quotes: ["I can give 20 hours a week."] },
        ],
      }),
      ["Content writing", "Motivation"],
      answers,
    );
    expect(evidence).toEqual([
      { skill: "Content writing", quotes: ["I wrote 30 posts for my uncle's sweet shop"] },
      { skill: "Motivation", quotes: [] },
    ]);
    expect(parseEvidence("{}", ["x"], answers)).toBeNull();
  });

  it("parseReport validates scores and drops quotes not in the answers", () => {
    const report = parseReport(
      JSON.stringify({
        skills: [
          { skill: "Motivation", score: 4, quote: "I can give 20 hours a week." },
          { skill: "Content writing", score: 3, quote: "I invented this" },
          { skill: "Content writing", score: 5, quote: "" },
          { skill: "Other", score: 9, quote: "" },
        ],
        strengths: ["Concrete example", ""],
        concerns: ["Check availability"],
        summary: "Good.",
      }),
      ["Content writing", "Motivation"],
      answers,
    );
    expect(report).toEqual({
      skills: [
        { skill: "Content writing", score: 3, quote: "" },
        { skill: "Motivation", score: 4, quote: "I can give 20 hours a week." },
      ],
      strengths: ["Concrete example"],
      concerns: ["Check availability"],
      summary: "Good.",
    });
    expect(
      parseReport('{"skills":[{"skill":"Motivation","score":2.5}]}', ["Motivation"], answers),
    ).toBeNull();
  });
});

describe("computeRecommendation", () => {
  it("is computed from the scores", () => {
    expect(computeRecommendation([4, 4, 3])).toBe("strong");
    expect(computeRecommendation([5, 5, 1])).toBe("maybe"); // a skill below 2 blocks "strong"
    expect(computeRecommendation([3, 2, 3])).toBe("maybe");
    expect(computeRecommendation([2, 2, 3])).toBe("not_fit");
    expect(computeRecommendation([])).toBe("not_fit");
  });
});

describe("answerInputSchema", () => {
  it("trims, caps length and clamps tab leaves", () => {
    const parsed = answerInputSchema.parse({
      text: "  hi  ",
      expectedIndex: 0,
      expectedTurns: 1,
      tabLeaves: 999,
    });
    expect(parsed).toMatchObject({ text: "hi", pasted: false, tabLeaves: 50 });
    expect(
      answerInputSchema.safeParse({ text: "   ", expectedIndex: 0, expectedTurns: 1 }).success,
    ).toBe(false);
    expect(
      answerInputSchema.safeParse({
        text: "x".repeat(MAX_INTERVIEW_ANSWER_LENGTH + 1),
        expectedIndex: 0,
        expectedTurns: 1,
      }).success,
    ).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("only allows interview links", () => {
    expect(safeNextPath("/interview/abcdefghijklmnopqrstuvwxyz_-0123")).toBe(
      "/interview/abcdefghijklmnopqrstuvwxyz_-0123",
    );
    expect(safeNextPath("https://evil.example/interview/abcdefghijklmnopqrstuvwxyz")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/admin")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("ai_interview stages", () => {
  it("are never scheduled", () => {
    const result = parseScheduleInput(
      { startsAtLocal: "2099-01-01T10:00", durationMinutes: 30, interviewerUserIds: ["a"] },
      "ai_interview",
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("have no duration in the pipeline editor", () => {
    const parsed = parsePipelineStages([
      {
        name: "AI interview",
        kind: "ai_interview",
        instructions: null,
        externalUrl: null,
        durationMinutes: 45,
        source: "organisation",
      },
    ]);
    expect(parsed).toMatchObject({
      ok: true,
      stages: [{ kind: "ai_interview", durationMinutes: null }],
    });
  });

  it("are accepted from the pipeline suggestion, without a duration", () => {
    const suggestion = parsePipelineSuggestion(
      JSON.stringify({
        stages: [
          { name: "AI interview", kind: "ai_interview", durationMinutes: 20 },
          { name: "Live interview", kind: "interview", durationMinutes: 30 },
        ],
      }),
    );
    expect(suggestion?.stages).toMatchObject([
      { kind: "ai_interview", durationMinutes: null },
      { kind: "interview", durationMinutes: 30 },
    ]);
  });
});
