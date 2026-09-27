"use client";

import { useActionState } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_FEEDBACK_NOTES_LENGTH,
  RECOMMENDATIONS,
  RECOMMENDATION_LABELS,
  type Recommendation,
} from "@/lib/hiring/types";
import { submitFeedbackAction, type FeedbackFormState } from "./actions";

const RATINGS = [1, 2, 3, 4, 5] as const;

export type FeedbackFormInitial = {
  rating: number;
  recommendation: Recommendation;
  notes: string;
} | null;

/** Feedback form for one assigned interview. Disabled (with an explanation) before the
 * interview starts or once it is cancelled; prefilled when the caller already left feedback. */
export function FeedbackForm({
  eventId,
  disabledReason,
  initial,
}: {
  eventId: string;
  disabledReason: string | null;
  initial: FeedbackFormInitial;
}) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(
    submitFeedbackAction.bind(null, eventId),
    { status: "idle" },
  );
  useActionErrorToast(state);

  if (disabledReason) {
    return (
      <p className="rounded-xl bg-[#f7f7f9] px-4 py-6 text-center text-sm text-[#4a4d53]">
        {disabledReason}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[#1b2a26]">Rating</legend>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-[#ecedef] text-sm font-medium text-[#1b2a26] has-checked:border-[#26594a] has-checked:bg-[#26594a] has-checked:text-white"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                defaultChecked={initial?.rating === value}
                required
                className="sr-only"
              />
              {value}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[#1b2a26]">Recommendation</legend>
        <div className="flex flex-wrap gap-2">
          {RECOMMENDATIONS.map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-lg border border-[#ecedef] px-3 py-1.5 text-sm text-[#1b2a26] has-checked:border-[#26594a] has-checked:bg-[#26594a] has-checked:text-white"
            >
              <input
                type="radio"
                name="recommendation"
                value={value}
                defaultChecked={initial?.recommendation === value}
                required
                className="sr-only"
              />
              {RECOMMENDATION_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={initial?.notes}
          required
          maxLength={MAX_FEEDBACK_NOTES_LENGTH}
          rows={5}
          placeholder="What stood out, strengths, concerns…"
        />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : initial ? "Update feedback" : "Submit feedback"}
      </Button>
    </form>
  );
}
