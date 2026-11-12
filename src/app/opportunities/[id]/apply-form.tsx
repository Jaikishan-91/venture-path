"use client";

import Link from "next/link";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState, useState } from "react";
import { ProofBadge } from "@/components/proof/proof-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_ANSWER_LENGTH } from "@/lib/opportunity-schemas";
import {
  MAX_APPLICATION_PROOFS,
  MAX_APPLY_TASK_ANSWER_LENGTH,
  type ProofLevel,
} from "@/lib/v2/types";
import { applyAction, type ApplyState } from "./actions";

export type ApplyResumeOption = { id: string; fileName: string };
export type ApplyProofOption = { id: string; title: string; level: ProofLevel };

export function ApplyForm({
  opportunityId,
  questions,
  resumes,
  canUpload,
  proofs,
  applyTask,
}: {
  opportunityId: string;
  questions: { id: string; prompt: string }[];
  resumes: ApplyResumeOption[];
  /** False when the resume library is full; the user must pick an existing resume. */
  canUpload: boolean;
  /** The student's proof cards, strongest first. */
  proofs: ApplyProofOption[];
  /** The listing's apply task, answered in the form when set. */
  applyTask: string | null;
}) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const [choice, setChoice] = useState(
    resumes[0]?.id ?? (proofs.length > 0 || applyTask ? "none" : "upload"),
  );
  const [picked, setPicked] = useState<string[]>(() =>
    proofs.slice(0, MAX_APPLICATION_PROOFS).map((proof) => proof.id),
  );
  const togglePick = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < MAX_APPLICATION_PROOFS
          ? [...current, id]
          : current,
    );
  if (state.status === "done")
    return <p className="text-sm">Application sent. The organisation will review it.</p>;

  return (
    <form action={action} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {/* Fieldsets default to min-width: min-content, which would stop long names truncating. */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Attach your proof</legend>
        <p className="text-xs text-muted-foreground">
          Pick up to {MAX_APPLICATION_PROOFS}. The business sees these first.
        </p>
        {proofs.map((proof) => (
          <label key={proof.id} className="flex min-w-0 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="proofIds"
              value={proof.id}
              checked={picked.includes(proof.id)}
              disabled={!picked.includes(proof.id) && picked.length >= MAX_APPLICATION_PROOFS}
              onChange={() => togglePick(proof.id)}
            />
            <span className="min-w-0 truncate">{proof.title}</span>
            <ProofBadge level={proof.level} />
          </label>
        ))}
        <Link href="/user/proof" className="text-sm text-[#26594a] underline">
          {proofs.length === 0 ? "Add a proof card" : "Manage your proof cards"}
        </Link>
      </fieldset>

      {applyTask && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="taskAnswer" className="leading-snug">
            Task from the business
          </Label>
          <p className="whitespace-pre-line rounded-lg bg-[#f7f7f9] p-3 text-sm">{applyTask}</p>
          <Textarea
            id="taskAnswer"
            name="taskAnswer"
            required
            maxLength={MAX_APPLY_TASK_ANSWER_LENGTH}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            Your answer is saved as a proof card and sent with this application.
          </p>
        </div>
      )}

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Resume (optional)</legend>
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <input
            type="radio"
            name="resumeChoice"
            value="none"
            checked={choice === "none"}
            onChange={() => setChoice("none")}
          />
          No resume, my proof is enough
        </label>
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
      {choice === "none" && picked.length === 0 && !applyTask && (
        <p className="text-xs text-muted-foreground">Attach at least one proof card or a resume.</p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  );
}
