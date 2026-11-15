"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { RepeatableInputs } from "@/components/repeatable-inputs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVELS,
  MAX_OPPORTUNITY_SKILLS,
  PAY_PERIOD_LABELS,
  PAY_PERIODS,
  WORK_MODE_LABELS,
  WORK_MODES,
} from "@/lib/opportunity-schemas";
import { MAX_APPLY_TASK_LENGTH } from "@/lib/v2/types";
import { saveOpportunityAction, type OpportunityFormState } from "./actions";
import { QuestionsEditor, type QuestionValue } from "./questions-editor";

export type OpportunityValues = {
  id: string;
  type: string;
  title: string;
  description: string;
  skills: string;
  workMode: string;
  city: string;
  payType: string;
  payAmount: string;
  payPeriod: string;
  duration: string;
  deadline: string;
  requirements: string;
  experienceLevel: string;
  compensationMin: string;
  compensationMax: string;
  applyTask: string;
};

const selectClass =
  "h-10 w-full rounded-[8px] border border-input bg-white px-3 text-base md:text-sm disabled:opacity-50 dark:bg-input/30";

const hintClass = "text-xs text-[#737373]";

/** Selectable radio "chip" (the radio stays a real input for keyboard and tests). */
const choiceClass =
  "flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-[#121212] transition-colors hover:border-[#a3a3a3] has-[:checked]:border-[#16a34a] has-[:checked]:bg-[#f0fdf4] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/20";

/** One settings-style block: title and help on the left, fields on the right. */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-[#f0f0f0] px-5 py-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10 md:px-6">
      <div>
        <h2 className="text-[14px] font-semibold text-[#121212]">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#737373]">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}

export function OpportunityForm({
  initial: values,
  minDeadline,
  questions,
  questionsLocked = false,
  aiEnabled,
}: {
  initial: OpportunityValues;
  minDeadline: string;
  questions: QuestionValue[];
  questionsLocked?: boolean;
  /** Whether saving a new listing asks the AI for skills and questions. */
  aiEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<OpportunityFormState, FormData>(
    saveOpportunityAction,
    { status: "idle" },
  );
  useActionErrorToast(state);
  const [payType, setPayType] = useState(values.payType);
  const [workMode, setWorkMode] = useState(values.workMode);

  // Submitting via onSubmit instead of `action` skips React's automatic form reset, which would
  // desync the controlled pay/work-mode inputs from the DOM after a failed save.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <FormSection
        title="Basics"
        description="What the work is. A clear title and a specific description get better applicants."
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={choiceClass}>
              <input
                type="radio"
                name="type"
                value="internship"
                defaultChecked={values.type !== "freelance"}
                className="accent-[#16a34a]"
              />
              Internship
            </label>
            <label className={choiceClass}>
              <input
                type="radio"
                name="type"
                value="freelance"
                defaultChecked={values.type === "freelance"}
                className="accent-[#16a34a]"
              />
              Freelance work
            </label>
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={values.title}
            required
            minLength={5}
            maxLength={120}
            placeholder="e.g. Social media intern"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={values.description}
            required
            maxLength={5000}
            rows={6}
          />
          <p className={hintClass}>
            What they will do day to day, and what a good result looks like.
          </p>
        </div>
        <RepeatableInputs
          label="Skills"
          itemLabel="Skill"
          name="skills"
          initial={values.skills}
          separator=","
          max={MAX_OPPORTUNITY_SKILLS}
          placeholder="canva"
          hint={`Add up to ${MAX_OPPORTUNITY_SKILLS}.`}
        />
      </FormSection>

      <FormSection title="Location" description="Where the work happens.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workMode">Work mode</Label>
            <select
              id="workMode"
              name="workMode"
              value={workMode}
              onChange={(event) => setWorkMode(event.target.value)}
              className={selectClass}
            >
              {WORK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {WORK_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">City{workMode === "remote" && " (optional)"}</Label>
            <Input
              id="city"
              name="city"
              defaultValue={values.city}
              required={workMode !== "remote"}
              maxLength={80}
            />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Pay"
        description="Shown on the listing. Freelance work must be paid; internships can be unpaid."
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Pay</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={choiceClass}>
              <input
                type="radio"
                name="payType"
                value="paid"
                checked={payType === "paid"}
                onChange={() => setPayType("paid")}
                className="accent-[#16a34a]"
              />
              Paid
            </label>
            <label className={choiceClass}>
              <input
                type="radio"
                name="payType"
                value="unpaid"
                checked={payType === "unpaid"}
                onChange={() => setPayType("unpaid")}
                className="accent-[#16a34a]"
              />
              Unpaid (internships only)
            </label>
          </div>
        </fieldset>
        {payType === "paid" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="payAmount">Amount (₹)</Label>
              <Input
                id="payAmount"
                name="payAmount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                defaultValue={values.payAmount}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="payPeriod">Pay period</Label>
              <select
                id="payPeriod"
                name="payPeriod"
                defaultValue={values.payPeriod || "month"}
                className={selectClass}
              >
                {PAY_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {PAY_PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="compensationMin">Compensation min (₹, optional)</Label>
            <Input
              id="compensationMin"
              name="compensationMin"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              defaultValue={values.compensationMin}
              placeholder="e.g. 20000"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="compensationMax">Compensation max (₹, optional)</Label>
            <Input
              id="compensationMax"
              name="compensationMax"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              defaultValue={values.compensationMax}
              placeholder="e.g. 50000"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Details" description="Timing and who you are looking for. All optional.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="duration">Duration (optional)</Label>
            <Input
              id="duration"
              name="duration"
              defaultValue={values.duration}
              maxLength={60}
              placeholder="e.g. 3 months"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="deadline">Application deadline (optional)</Label>
            <Input
              id="deadline"
              name="deadline"
              type="date"
              min={minDeadline}
              defaultValue={values.deadline}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="experienceLevel">Experience level (optional)</Label>
          <select
            id="experienceLevel"
            name="experienceLevel"
            defaultValue={values.experienceLevel || ""}
            className={selectClass}
          >
            <option value="">Choose…</option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {EXPERIENCE_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="requirements">Requirements (optional)</Label>
          <Textarea
            id="requirements"
            name="requirements"
            defaultValue={values.requirements}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Must have a portfolio, 2+ years experience..."
          />
          <p id="requirements-hint" className={hintClass}>
            Optional. Shown to applicants and used in AI analysis.
          </p>
        </div>
      </FormSection>

      <FormSection
        title="Screening"
        description="Questions and a small task every applicant answers before you review them."
      >
        <QuestionsEditor initial={questions} locked={questionsLocked} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="applyTask">Apply task (optional)</Label>
          <Textarea
            id="applyTask"
            name="applyTask"
            defaultValue={values.applyTask}
            maxLength={MAX_APPLY_TASK_LENGTH}
            rows={3}
            aria-describedby="applyTask-hint"
            placeholder="e.g. Write 3 Instagram captions for our Diwali sweets box."
          />
          <p id="applyTask-hint" className={hintClass}>
            A small task (30–60 minutes) every applicant must answer. Their answer becomes a proof
            card you can see.
          </p>
        </div>
      </FormSection>

      {/* Sits above the phone tab bar; flush with the bottom of the screen from md. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] z-10 flex flex-col gap-3 border-t border-[#e5e5e5] bg-white/95 px-5 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between md:bottom-0 md:px-6">
        <p className="text-xs text-[#737373]">
          {!values.id && aiEnabled
            ? "When you save, AI adds the skills this listing needs and, if you wrote no questions, drafts a few. You can review them before publishing."
            : values.id
              ? "Changes apply to the listing as soon as you save."
              : "Saved as a draft. Publish it from your listings when you're ready."}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/organisation/opportunities" className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending
              ? values.id
                ? "Saving…"
                : aiEnabled
                  ? "Saving and asking AI…"
                  : "Saving…"
              : values.id
                ? "Save changes"
                : "Save as draft"}
          </Button>
        </div>
      </div>
    </form>
  );
}
