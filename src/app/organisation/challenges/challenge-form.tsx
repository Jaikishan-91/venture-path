"use client";

import { Sparkles } from "lucide-react";
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
    <form ref={formRef} onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {aiAssisted && <input type="hidden" name="aiAssisted" value="1" />}

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onAssist}
            disabled={assisting || pending}
          >
            <Sparkles strokeWidth={1.75} aria-hidden />
            {assisting ? "Asking AI…" : "Make it clearer with AI"}
          </Button>
        )}
      </div>

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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Judging points (optional, up to 3)</legend>
        {criteria.map((criterion, index) => (
          <Input
            key={index}
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
        ))}
        <p className="text-xs text-muted-foreground">
          {locked
            ? "Students have entered, so the judging points and reward can't change."
            : "AI scores every solution against these. They lock when the first student submits."}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Reward (at least one)</legend>
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="rewardHire"
            defaultChecked={initial.rewardHire}
            disabled={locked}
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="file">File (optional)</Label>
        {initial.fileName && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a href={`/api/challenges/${initial.id}/file`} className="underline">
              {initial.fileName}
            </a>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="removeFile" /> Remove
            </label>
          </div>
        )}
        <input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
          className="max-w-full text-sm"
        />
        <p className="text-xs text-muted-foreground">
          A sample sheet or photo. PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB.
          {initial.fileName && " A new file replaces the current one."}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {initial.isDraft ? (
          <>
            <Button type="submit" name="intent" value="publish" disabled={pending || assisting}>
              {pending ? "Saving…" : "Publish"}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              disabled={pending || assisting}
            >
              Save draft
            </Button>
          </>
        ) : (
          <Button type="submit" name="intent" value="save" disabled={pending || assisting}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        )}
        <Link href="/organisation/challenges" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
