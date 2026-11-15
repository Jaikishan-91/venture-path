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

/** One selectable row inside a bordered option group. */
const rowClass =
  "flex min-w-0 items-center gap-3 border-b border-[#f0f0f0] px-3 py-2.5 text-[13px] text-[#121212] transition-colors last:border-b-0 hover:bg-[#fafafa] has-checked:bg-[#f0fdf4]";

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
    return (
      <p className="rounded-lg bg-[#f0fdf4] px-3 py-2.5 text-[13px] text-[#15803d]">
        Application sent. The organisation will review it.
      </p>
    );

  return (
    <form action={action} className="flex min-w-0 flex-col gap-5">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {/* Fieldsets default to min-width: min-content, which would stop long names truncating. */}
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-[13px] font-semibold text-[#121212]">Attach your proof</legend>
        <p className="-mt-1 text-[12px] text-[#737373]">
          Pick up to {MAX_APPLICATION_PROOFS}. The business sees these first.
        </p>
        {proofs.length > 0 && (
          <div className="flex flex-col overflow-hidden rounded-lg border border-[#e5e5e5]">
            {proofs.map((proof) => {
              const checked = picked.includes(proof.id);
              const disabled = !checked && picked.length >= MAX_APPLICATION_PROOFS;
              return (
                <label
                  key={proof.id}
                  className={`${rowClass} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    name="proofIds"
                    value={proof.id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => togglePick(proof.id)}
                    className="size-4 shrink-0 accent-[#16a34a]"
                  />
                  <span className="min-w-0 flex-1 truncate">{proof.title}</span>
                  <ProofBadge level={proof.level} />
                </label>
              );
            })}
          </div>
        )}
        <Link
          href="/user/proof"
          className="self-start text-[13px] font-medium text-[#15803d] hover:underline"
        >
          {proofs.length === 0 ? "Add a proof card" : "Manage your proof cards"}
        </Link>
      </fieldset>

      {applyTask && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="taskAnswer" className="text-[13px] leading-snug font-semibold">
            Task from the business
          </Label>
          <p className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3 text-[13px] leading-relaxed whitespace-pre-line text-[#404040]">
            {applyTask}
          </p>
          <Textarea
            id="taskAnswer"
            name="taskAnswer"
            required
            maxLength={MAX_APPLY_TASK_ANSWER_LENGTH}
            rows={6}
            aria-describedby="taskAnswer-hint"
          />
          <p id="taskAnswer-hint" className="text-[12px] text-[#737373]">
            Your answer is saved as a proof card and sent with this application.
          </p>
        </div>
      )}

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-[#121212]">Resume (optional)</legend>
        <div className="flex flex-col overflow-hidden rounded-lg border border-[#e5e5e5]">
          <label className={`${rowClass} cursor-pointer`}>
            <input
              type="radio"
              name="resumeChoice"
              value="none"
              checked={choice === "none"}
              onChange={() => setChoice("none")}
              className="size-4 shrink-0 accent-[#16a34a]"
            />
            No resume, my proof is enough
          </label>
          {resumes.map((resume) => (
            <label key={resume.id} className={`${rowClass} cursor-pointer`}>
              <input
                type="radio"
                name="resumeChoice"
                value={resume.id}
                checked={choice === resume.id}
                onChange={() => setChoice(resume.id)}
                className="size-4 shrink-0 accent-[#16a34a]"
              />
              <span className="min-w-0 truncate">{resume.fileName}</span>
            </label>
          ))}
          {canUpload && (
            <label className={`${rowClass} cursor-pointer`}>
              <input
                type="radio"
                name="resumeChoice"
                value="upload"
                checked={choice === "upload"}
                onChange={() => setChoice("upload")}
                className="size-4 shrink-0 accent-[#16a34a]"
              />
              Upload a new resume
            </label>
          )}
        </div>
        {!canUpload && (
          <p className="text-[12px] text-[#737373]">
            Your resume library is full. Delete one on the Resumes page to upload another.
          </p>
        )}
        {choice === "upload" && canUpload && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[#d4d4d4] bg-[#fafafa] p-3">
            <Label htmlFor="resume" className="sr-only">
              Resume file
            </Label>
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
              required
              aria-describedby="resume-hint"
              className="max-w-full text-[13px] file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-[#e5e5e5] file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[#121212]"
            />
            <p id="resume-hint" className="text-[12px] text-[#737373]">
              PDF, DOC or DOCX, up to 5 MB. It is also saved to your resume library.
            </p>
          </div>
        )}
      </fieldset>

      {questions.map((question, index) => (
        <div key={question.id} className="flex flex-col gap-2">
          <Label
            htmlFor={`answer-${question.id}`}
            className="text-[13px] leading-snug font-semibold"
          >
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
        <Label htmlFor="note" className="text-[13px] font-semibold">
          Note (optional)
        </Label>
        <Textarea
          id="note"
          name="note"
          maxLength={1000}
          rows={3}
          placeholder="Anything the business should know"
        />
      </div>
      <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-4">
        {choice === "none" && picked.length === 0 && !applyTask && (
          <p role="status" className="text-[12px] text-[#b45309]">
            Attach at least one proof card or a resume.
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Apply"}
        </Button>
      </div>
    </form>
  );
}
