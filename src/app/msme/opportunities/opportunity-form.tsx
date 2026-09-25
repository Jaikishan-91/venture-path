"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_OPPORTUNITY_SKILLS,
  PAY_PERIOD_LABELS,
  PAY_PERIODS,
  WORK_MODE_LABELS,
  WORK_MODES,
} from "@/lib/opportunity-schemas";
import { saveOpportunityAction, type OpportunityFormState } from "./actions";

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
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm disabled:opacity-50 dark:bg-input/30";

export function OpportunityForm({
  initial: values,
  minDeadline,
}: {
  initial: OpportunityValues;
  minDeadline: string;
}) {
  const [state, action, pending] = useActionState<OpportunityFormState, FormData>(
    saveOpportunityAction,
    { status: "idle" },
  );
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="type"
            value="internship"
            defaultChecked={values.type !== "freelance"}
          />
          Internship
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="type"
            value="freelance"
            defaultChecked={values.type === "freelance"}
          />
          Freelance work
        </label>
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
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="skills">Skills</Label>
        <Input
          id="skills"
          name="skills"
          defaultValue={values.skills}
          aria-describedby="skills-hint"
        />
        <p id="skills-hint" className="text-xs text-muted-foreground">
          Separate with commas, up to {MAX_OPPORTUNITY_SKILLS}.
        </p>
      </div>
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Pay</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="payType"
            value="paid"
            checked={payType === "paid"}
            onChange={() => setPayType("paid")}
          />
          Paid
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="payType"
            value="unpaid"
            checked={payType === "unpaid"}
            onChange={() => setPayType("unpaid")}
          />
          Unpaid (internships only)
        </label>
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
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Save as draft"}
        </Button>
        <Link href="/msme/opportunities" className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
