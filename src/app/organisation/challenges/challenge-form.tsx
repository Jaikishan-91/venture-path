"use client";

import { Paperclip, Sparkles } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_CHALLENGE_CRITERIA,
  MAX_CHALLENGE_GOOD_SOLUTION_LENGTH,
  MAX_CHALLENGE_PROBLEM_LENGTH,
  MAX_CHALLENGE_TITLE_LENGTH,
  MAX_CRITERION_LENGTH,
  MAX_REWARD_INR,
} from "@/lib/v2/types";
import { assistChallengeAction, saveChallengeAction, type FormState } from "./actions";

export type ChallengeValues = {
  id: string;
  title: string;
  problem: string;
  goodSolution: string;
  criteria: string[];
  rewardMoney: string;
  rewardHire: boolean;
  deadline: string;
  fileName: string | null;
  isDraft: boolean;
};

const padCriteria = (criteria: string[]) =>
  Array.from({ length: MAX_CHALLENGE_CRITERIA }, (_, i) => criteria[i] ?? "");

export function ChallengeForm({
  initial,
  minDeadline,
  aiEnabled,
  locked,
}: {
  initial: ChallengeValues;
  minDeadline: string;
  aiEnabled: boolean;
  /** Someone has submitted: judging points and reward can't change. */
  locked: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveChallengeAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const [problem, setProblem] = useState(initial.problem);
  const [criteria, setCriteria] = useState(() => padCriteria(initial.criteria));
  const [aiAssisted, setAiAssisted] = useState(false);
  const [assisting, startAssist] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // onSubmit instead of `action` keeps the controlled fields after a failed save.
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => action(formData));
  }

  function onAssist() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    startAssist(async () => {
      const result = await assistChallengeAction({
        title: String(data.get("title") ?? ""),
        problem,
        goodSolution: String(data.get("goodSolution") ?? ""),
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      if (result.status !== "done") return;
      setProblem(result.problem);
      if (!locked && result.criteria.length > 0) setCriteria(padCriteria(result.criteria));
      setAiAssisted(true);
      toast.success("AI suggestions added. Check them and edit anything before saving.");
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {aiAssisted && <input type="hidden" name="aiAssisted" value="1" />}

      <FormSection
        title="The problem"
        help="Explain it in your own words. Students see this first, so plain language works best."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={initial.title}
            required
            minLength={5}
            maxLength={MAX_CHALLENGE_TITLE_LENGTH}
            placeholder="e.g. Our Instagram gets no customers"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="problem">What&apos;s the problem?</Label>
          <Textarea
            id="problem"
            name="problem"
            value={problem}
            onChange={(event) => setProblem(event.target.value)}
            required
            maxLength={MAX_CHALLENGE_PROBLEM_LENGTH}
            rows={6}
            placeholder="Explain it in your own words, as you would to a friend."
          />
          {aiEnabled && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAssist}
                disabled={assisting || pending}
              >
                <Sparkles strokeWidth={1.75} aria-hidden />
                {assisting ? "Asking AI…" : "Make it clearer with AI"}
              </Button>
              <span className="text-[12px] text-[#737373]">
                Rewrites the problem and suggests judging points. You can edit everything.
              </span>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        title="What good looks like"
        help="Optional. A sentence about the result you hope for helps students aim right."
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="goodSolution">What would a good solution look like? (optional)</Label>
          <Textarea
            id="goodSolution"
            name="goodSolution"
            defaultValue={initial.goodSolution}
            maxLength={MAX_CHALLENGE_GOOD_SOLUTION_LENGTH}
            rows={3}
          />
        </div>
      </FormSection>

      <FormSection
        title="Judging criteria"
        help="AI scores every solution against these points, so they should be specific."
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Judging points (optional, up to 3)</legend>
          {criteria.map((criterion, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-[#fafafa] text-[12px] font-medium text-[#525252]"
              >
                {index + 1}
              </span>
              <Input
                name="criteria"
                aria-label={`Judging point ${index + 1}`}
                value={criterion}
                readOnly={locked}
                maxLength={MAX_CRITERION_LENGTH}
                placeholder={`Judging point ${index + 1}`}
                onChange={(event) =>
                  setCriteria((current) =>
                    current.map((value, i) => (i === index ? event.target.value : value)),
                  )
                }
              />
            </div>
          ))}
          <p className={`mt-1 text-xs ${locked ? "text-[#b45309]" : "text-muted-foreground"}`}>
            {locked
              ? "Students have entered, so the judging points and reward can't change."
              : "AI scores every solution against these. They lock when the first student submits."}
          </p>
        </fieldset>
      </FormSection>

      <FormSection
        title="Reward and timing"
        help="Offer money, a hiring chance, or both. Submissions close at the end of the deadline day."
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Reward (at least one)</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rewardMoney">Money (₹)</Label>
            <Input
              id="rewardMoney"
              name="rewardMoney"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_REWARD_INR}
              step={1}
              defaultValue={initial.rewardMoney}
              readOnly={locked}
              placeholder="e.g. 2000"
              className="max-w-48"
            />
            <p className="text-xs text-muted-foreground">
              You pay the winner directly (UPI or cash).
            </p>
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm has-checked:border-[#bbf7d0] has-checked:bg-[#f0fdf4]">
            <input
              type="checkbox"
              name="rewardHire"
              defaultChecked={initial.rewardHire}
              disabled={locked}
              className="mt-0.5 size-4 shrink-0 accent-[#16a34a]"
            />
            Hiring: offer the winner an internship or job
          </label>
          {/* A disabled checkbox isn't submitted; keep the locked value. */}
          {locked && initial.rewardHire && <input type="hidden" name="rewardHire" value="on" />}
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="deadline">Deadline</Label>
          <Input
            id="deadline"
            name="deadline"
            type="date"
            min={minDeadline}
            defaultValue={initial.deadline}
            required
            className="max-w-48"
          />
          <p className="text-xs text-muted-foreground">
            Submissions close at the end of this day (India time).
          </p>
        </div>
      </FormSection>

      <FormSection title="Attachment" help="Optional. A sample sheet or photo students can use.">
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">File (optional)</Label>
          {initial.fileName && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-sm">
              <a
                href={`/api/challenges/${initial.id}/file`}
                className="inline-flex min-w-0 items-center gap-2 font-medium text-[#121212] hover:underline"
              >
                <Paperclip aria-hidden className="size-4 shrink-0 text-[#737373]" />
                <span className="truncate">{initial.fileName}</span>
              </a>
              <label className="flex items-center gap-2 text-[#525252]">
                <input type="checkbox" name="removeFile" /> Remove
              </label>
            </div>
          )}
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.doc,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
            className="max-w-full rounded-lg border border-dashed border-[#d4d4d4] p-2 text-sm text-[#525252] file:mr-3 file:rounded-md file:border-0 file:bg-[#f5f5f5] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#121212]"
          />
          <p className="text-xs text-muted-foreground">
            PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB.
            {initial.fileName && " A new file replaces the current one."}
          </p>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3">
        <Link
          href="/organisation/challenges"
          className={buttonVariants({ variant: "ghost", className: "mr-auto sm:mr-0" })}
        >
          Cancel
        </Link>
        {initial.isDraft ? (
          <>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              disabled={pending || assisting}
            >
              Save draft
            </Button>
            <Button type="submit" name="intent" value="publish" disabled={pending || assisting}>
              {pending ? "Saving…" : "Publish"}
            </Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="save" disabled={pending || assisting}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** One settings-style row: title and help on the left, fields on the right. */
function FormSection({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-[#f0f0f0] px-5 py-6 last-of-type:border-b-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-semibold text-[#121212]">{title}</h2>
        <p className="text-[13px] leading-relaxed text-[#737373]">{help}</p>
      </div>
      <div className="flex max-w-2xl min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}
