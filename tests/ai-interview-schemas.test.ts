import { describe, expect, it } from "vitest";
import {
  answerInputSchema,
  applyEvidenceRules,
  computeRecommendation,
  MAX_EVIDENCE_QUOTES,
  quotesByQuestion,
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
import { interviewScore, MAX_INTERVIEW_ANSWER_LENGTH } from "@/lib/v2/types";

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
  it("has 6 questions in the 2/2/1/1 mix, using skills and proofs when present", () => {
    const questions = fallbackQuestions(
      { title: "Social media intern", skills: ["Instagram", "Canva"], businessName: "Sweet Shop" },
      [{ title: "Diwali campaign", whatIDid: "Ran posts", skills: ["Instagram"] }],
    );
    expect(questions.map((question) => question.kind)).toEqual(GOOD_KINDS);
    expect(questions[0].text).toContain("Instagram");
    expect(questions[2].text).toContain("Diwali campaign");
    expect(questions[4].text).toContain("Sweet Shop");
  });

  it("works with no skills and no proofs", () => {
    const questions = fallbackQuestions({ title: "Intern", skills: [], businessName: "Acme" });
    expect(questions).toHaveLength(6);
    expect(reportSkills(questions)).toEqual([
      "Role skills",
      "Problem solving",
      "Motivation & availability",
    ]);
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

  it("parseReport reads per-question scores only for the plan's ids", () => {
    const reply = JSON.stringify({
      skills: [{ skill: "Motivation", score: "3", quote: "" }],
      questions: [
        { questionId: "q2", score: 3, reason: "  Clear hours,\n tied to the shop.  " },
        { questionId: "q1", score: "2", reason: "Generic." },
        { questionId: "q7", score: 4, reason: "Unknown id." },
        { questionId: "q1", score: 5, reason: "Repeat." },
        { questionId: "q2", score: 6, reason: "Out of range." },
        { questionId: "q3", score: 1.5, reason: "Not whole." },
        { questionId: "q3", score: "", reason: "Empty." },
        "junk",
      ],
      strengths: [],
      concerns: [],
      summary: "",
    });
    expect(parseReport(reply, ["Motivation"], answers, ["q1", "q2", "q3"])!.questions).toEqual([
      { questionId: "q1", score: 2, reason: "Generic." },
      { questionId: "q2", score: 3, reason: "Clear hours, tied to the shop." },
    ]);
    // Without the plan's ids (old callers) there is no per-question list.
    expect(parseReport(reply, ["Motivation"], answers)!.questions).toBeUndefined();
    // A missing list is an empty one, not an invalid report.
    expect(
      parseReport('{"skills":[{"skill":"Motivation","score":1}]}', ["Motivation"], answers, ["q1"])!
        .questions,
    ).toEqual([]);
  });

  it("parseEvidence keeps up to MAX_EVIDENCE_QUOTES per skill", () => {
    const texts = ["one two three. four five six. seven eight nine. ten eleven. twelve!"];
    const evidence = parseEvidence(
      JSON.stringify({
        evidence: [
          {
            skill: "SEO",
            quotes: ["one two three", "four five six", "seven eight nine", "ten eleven", "twelve"],
          },
        ],
      }),
      ["SEO"],
      texts,
    );
    expect(evidence![0].quotes).toHaveLength(MAX_EVIDENCE_QUOTES);
  });

  it("quotesByQuestion attributes quotes to the answer (or follow-up) they came from", () => {
    const at = new Date().toISOString();
    const questions = [
      { id: "q1", kind: "skill" as const, skill: "SEO", text: "SEO?" },
      { id: "q2", kind: "proof" as const, skill: "SEO", text: "Your project?" },
    ];
    const turns = [
      { role: "student" as const, text: "I ranked a bakery site first.", questionId: "q1", at },
      {
        role: "student" as const,
        text: "Traffic doubled in a month.",
        questionId: "q1",
        followUp: true,
        at,
      },
      { role: "student" as const, text: "I built the shop's Instagram.", questionId: "q2", at },
    ];
    const byQuestion = quotesByQuestion(
      [
        {
          skill: "SEO",
          quotes: ["ranked a bakery site first", "Traffic doubled", "built the shop's Instagram"],
        },
      ],
      questions,
      turns,
    );
    expect(byQuestion.get("q1")).toEqual(["ranked a bakery site first", "Traffic doubled"]);
    expect(byQuestion.get("q2")).toEqual(["built the shop's Instagram"]);
  });

  it("applyEvidenceRules zeroes skills without quotes and unanswered questions", () => {
    const result = applyEvidenceRules(
      {
        skills: [
          { skill: "SEO", score: 4, quote: "x" },
          { skill: "Canva", score: 5, quote: "y" },
        ],
        strengths: [],
        concerns: [],
        summary: "",
        questions: [
          { questionId: "q1", score: 4, reason: "Specific." },
          { questionId: "q2", score: 3, reason: "Made up." },
        ],
      },
      [
        { skill: "SEO", quotes: ["x"] },
        { skill: "Canva", quotes: [] },
      ],
      new Set(["q1"]),
    );
    expect(result.skills).toEqual([
      { skill: "SEO", score: 4, quote: "x" },
      { skill: "Canva", score: 0, quote: "" },
    ]);
    expect(result.questions).toEqual([
      { questionId: "q1", score: 4, reason: "Specific." },
      { questionId: "q2", score: 0, reason: "No answer." },
    ]);
  });
});

describe("interviewScore", () => {
  it("is the 0–100 mean of the 0–5 skill scores and agrees with the recommendation bands", () => {
    expect(interviewScore(null)).toBeNull();
    expect(interviewScore({ skills: [] })).toBeNull();
    const report = (scores: number[]) => ({
      skills: scores.map((score, index) => ({ skill: `s${index}`, score, quote: "" })),
    });
    expect(interviewScore(report([5, 5, 5]))).toBe(100);
    expect(interviewScore(report([4, 3]))).toBe(70);
    expect(computeRecommendation([4, 3])).toBe("strong");
    expect(interviewScore(report([3, 2]))).toBe(50);
    expect(computeRecommendation([3, 2])).toBe("maybe");
    expect(interviewScore(report([2, 2, 3]))).toBe(47);
    expect(computeRecommendation([2, 2, 3])).toBe("not_fit");
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
