"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_QUESTION_LENGTH, MAX_QUESTIONS } from "@/lib/opportunity-schemas";

export type QuestionValue = { prompt: string; source: "ai" | "organisation" };

/**
 * Screening questions on the listing form (ADR-032). Submits one `questions` field per question.
 * Once anyone has applied the questions are shown read-only and not submitted, so they stay as they are.
 */
export function QuestionsEditor({
  initial,
  locked,
}: {
  initial: QuestionValue[];
  locked: boolean;
}) {
  const [items, setItems] = useState<QuestionValue[]>(initial);

  if (locked) {
    return (
      <section className="flex flex-col gap-2" aria-labelledby="questions-heading">
        <h3 id="questions-heading" className="text-sm font-medium">
          Screening questions
        </h3>
        {items.length > 0 ? (
          <ol className="flex flex-col divide-y divide-[#f0f0f0] rounded-lg border border-[#e5e5e5] text-sm">
            {items.map((item, index) => (
              <li key={item.prompt} className="flex gap-3 px-3 py-2.5 break-words">
                <span className="w-4 shrink-0 text-[#a3a3a3] tabular-nums">{index + 1}.</span>
                <span className="text-[#121212]">{item.prompt}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[#737373]">No questions.</p>
        )}
        <p className="text-xs text-[#737373]">
          Questions can&apos;t change after someone has applied.
        </p>
      </section>
    );
  }

  // Mirrors the server rule: a question is an AI draft only while its text is unchanged.
  const aiDrafts = new Set(initial.filter((q) => q.source === "ai").map((q) => q.prompt));
  const update = (index: number, prompt: string) =>
    setItems((current) =>
      current.map((item, i) =>
        i === index
          ? { prompt, source: aiDrafts.has(prompt.trim()) ? "ai" : "organisation" }
          : item,
      ),
    );

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="questions-hint">
      <legend className="text-sm font-medium">Screening questions (optional)</legend>
      <input type="hidden" name="questionsEditable" value="1" />
      {items.map((item, index) => {
        const id = `question-${index}`;
        return (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id} className="flex items-center gap-1.5 text-[13px]">
                Question {index + 1}
                {item.source === "ai" && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#f0fdf4] px-1.5 py-0.5 text-xs font-normal text-[#15803d]">
                    <Sparkles className="size-3" strokeWidth={1.75} aria-hidden />
                    AI draft
                  </span>
                )}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove question ${index + 1}`}
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                <X strokeWidth={1.75} />
              </Button>
            </div>
            <Textarea
              id={id}
              name="questions"
              value={item.prompt}
              rows={2}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(event) => update(index, event.target.value)}
              className="bg-white"
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={items.length >= MAX_QUESTIONS}
        onClick={() => setItems((current) => [...current, { prompt: "", source: "organisation" }])}
      >
        <Plus strokeWidth={1.75} />
        Add question
      </Button>
      <p id="questions-hint" className="text-xs text-[#737373]">
        Applicants answer each question in writing, and the answers are scored by AI. Up to{" "}
        {MAX_QUESTIONS}. They lock once someone applies.
      </p>
    </fieldset>
  );
}
