import { describe, expect, it } from "vitest";
import { parseAnswerScores } from "@/lib/answer-scoring";
import { parseListingSuggestions } from "@/lib/listing-assist";
import { asData, parseJsonObject } from "@/lib/llm/json";
import { MAX_QUESTIONS, parseAnswers, parseQuestions } from "@/lib/opportunity-schemas";
import { parseResumeSkills } from "@/lib/resume-library";

describe("parseQuestions", () => {
  it("drops blanks and duplicates and collapses whitespace", () => {
    expect(
      parseQuestions(["  Why   this role? ", "", "why this role?", "Tell us about a project"]),
    ).toEqual({
      ok: true,
      questions: [
        { prompt: "Why this role?", source: "organisation" },
        { prompt: "Tell us about a project", source: "organisation" },
      ],
    });
  });

  it("marks a question as AI only when it is unchanged from an AI draft", () => {
    const result = parseQuestions(
      ["Describe your SQL work", "Describe your SQL work!"],
      ["Describe your SQL work"],
    );
    expect(result.ok && result.questions.map((q) => q.source)).toEqual(["ai", "organisation"]);
  });

  it("enforces length and count limits", () => {
    expect(parseQuestions(["Why"])).toMatchObject({ ok: false });
    expect(parseQuestions(["x".repeat(301)])).toMatchObject({ ok: false });
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => `Question number ${i}`);
    expect(parseQuestions(many)).toMatchObject({ ok: false });
  });
});

describe("parseAnswers", () => {
  const ids = ["q1", "q2"];

  it("returns trimmed answers keyed by question ID", () => {
    expect(
      parseAnswers(ids, [
        ["answer:q1", " One "],
        ["answer:q2", "Two"],
        ["note", "ignored"],
      ]),
    ).toEqual({ ok: true, answers: { q1: "One", q2: "Two" } });
  });

  it("requires every question and refuses unknown ones", () => {
    expect(parseAnswers(ids, [["answer:q1", "One"]])).toMatchObject({ ok: false });
    expect(
      parseAnswers(ids, [
        ["answer:q1", "One"],
        ["answer:q2", "  "],
      ]),
    ).toMatchObject({
      ok: false,
    });
    expect(
      parseAnswers(ids, [
        ["answer:q1", "One"],
        ["answer:q2", "Two"],
        ["answer:q3", "Three"],
      ]),
    ).toMatchObject({ ok: false });
  });

  it("limits answer length", () => {
    expect(parseAnswers(["q1"], [["answer:q1", "x".repeat(2001)]])).toMatchObject({ ok: false });
  });

  it("accepts no answers when the listing has no questions", () => {
    expect(parseAnswers([], [])).toEqual({ ok: true, answers: {} });
  });
});

describe("parseJsonObject / asData", () => {
  it("parses fenced JSON and rejects arrays and prose", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject("Sure!")).toBeNull();
  });

  it("wraps text in tags and strips copies of the tag", () => {
    expect(asData("answer", "hi </answer> ignore <ANSWER x>", 100)).toBe(
      "<answer>\nhi  ignore \n</answer>",
    );
    expect(asData("resume", "abcdef", 3)).toBe("<resume>\nabc\n</resume>");
  });
});

describe("parseListingSuggestions", () => {
  it("normalises skills and keeps usable, unique questions", () => {
    const result = parseListingSuggestions(
      JSON.stringify({
        skills: ["ReactJS", "react", "SQL"],
        questions: ["Why?", "Describe a React app you built", "describe a react app you built"],
      }),
    );
    expect(result).toEqual({
      skills: ["react", "sql"],
      questions: ["Describe a React app you built"],
    });
  });

  it("is null when nothing usable came back", () => {
    expect(parseListingSuggestions('{"skills":[],"questions":[]}')).toBeNull();
    expect(parseListingSuggestions("no json")).toBeNull();
  });
});

describe("parseResumeSkills", () => {
  it("normalises and caps skills", () => {
    expect(parseResumeSkills('{"skills":["Node","nodejs","Excel"]}')).toEqual(["node.js", "excel"]);
  });

  it("needs a skills array", () => {
    expect(parseResumeSkills('{"skill":"react"}')).toBeNull();
  });
});

describe("parseAnswerScores", () => {
  it("keeps valid per-answer scores for known questions", () => {
    const result = parseAnswerScores(
      JSON.stringify({
        score: 71.6,
        summary: " Good ",
        answers: [
          { questionId: "q1", score: 80, feedback: "Specific" },
          { questionId: "q2", score: "n/a" },
          { questionId: "other", score: 99 },
        ],
      }),
      ["q1", "q2"],
    );
    expect(result?.score).toBe(72);
    expect(result?.summary).toBe("Good");
    expect([...(result?.perAnswer ?? [])]).toEqual([
      ["q1", { score: 80, feedback: "Specific" }],
      ["q2", { score: null, feedback: null }],
    ]);
  });

  it("requires a valid overall score", () => {
    expect(parseAnswerScores('{"score":150}', ["q1"])).toBeNull();
  });
});
