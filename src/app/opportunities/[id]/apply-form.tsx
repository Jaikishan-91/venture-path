"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ANSWER_LENGTH } from "@/lib/opportunity-schemas";
import { applyAction, type ApplyState } from "./actions";

export type ApplyResumeOption = { id: string; fileName: string };

export function ApplyForm({
  opportunityId,
  questions,
  resumes,
  canUpload,
}: {
  opportunityId: string;
  questions: { id: string; prompt: string }[];
  resumes: ApplyResumeOption[];
  /** False when the resume library is full; the user must pick an existing resume. */
  canUpload: boolean;
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const [choice, setChoice] = useState(resumes[0]?.id ?? "upload");
  if (state.status === "done")
    return <p className="text-sm">Application sent. The organisation will review it.</p>;

  return (
    <form action={action} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {/* Fieldsets default to min-width: min-content, which would stop long names truncating. */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Resume</legend>
        {resumes.map((resume) => (
          <label key={resume.id} className="flex min-w-0 items-center gap-2 text-sm">
            <input
              type="radio"
              name="resumeChoice"
              value={resume.id}
              checked={choice === resume.id}
              onChange={() => setChoice(resume.id)}
            />
            <span className="truncate">{resume.fileName}</span>
          </label>
        ))}
        {canUpload ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="resumeChoice"
              value="upload"
              checked={choice === "upload"}
              onChange={() => setChoice("upload")}
            />
            Upload a new resume
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Your resume library is full. Delete one on the Resumes page to upload another.
          </p>
        )}
        {choice === "upload" && canUpload && (
          <div className="flex flex-col gap-1.5 pl-6">
            <Label htmlFor="resume" className="sr-only">
              Resume file
            </Label>
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              required
              className="max-w-full text-sm"
            />
            <p className="text-xs text-muted-foreground">
              PDF, DOC or DOCX, up to 5 MB. It is also saved to your resume library.
            </p>
          </div>
        )}
      </fieldset>

      {questions.map((question, index) => (
        <div key={question.id} className="flex flex-col gap-2">
          <Label htmlFor={`answer-${question.id}`} className="leading-snug">
            {index + 1}. {question.prompt}
          </Label>
          <Textarea
            id={`answer-${question.id}`}
            name={`answer:${question.id}`}
            required
            maxLength={MAX_ANSWER_LENGTH}
            rows={4}
          />
        </div>
      ))}

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" name="note" maxLength={1000} rows={3} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  );
}
