"use client";

import { Clock } from "lucide-react";
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
      <p className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] px-4 py-6 text-center text-[13px] text-[#737373]">
        <Clock aria-hidden className="size-5 text-[#a3a3a3]" />
        {disabledReason}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-[#121212]">Rating</legend>
        <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-[#e5e5e5]">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="flex h-10 cursor-pointer items-center justify-center border-r border-[#e5e5e5] text-[14px] font-medium text-[#525252] transition-colors last:border-r-0 hover:bg-[#fafafa] has-checked:bg-[#121212] has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-[#16a34a] has-focus-visible:ring-inset"
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
        <p className="flex justify-between text-[11px] text-[#a3a3a3]">
          <span>Weak</span>
          <span>Excellent</span>
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-[#121212]">Recommendation</legend>
        <div className="flex flex-wrap gap-2">
          {RECOMMENDATIONS.map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#404040] transition-colors hover:border-[#a3a3a3] has-checked:border-[#16a34a] has-checked:bg-[#f0fdf4] has-checked:text-[#15803d] has-focus-visible:ring-2 has-focus-visible:ring-[#16a34a]"
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
        <p className="text-[12px] text-[#a3a3a3]">Only your organisation sees this.</p>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : initial ? "Update feedback" : "Submit feedback"}
      </Button>
    </form>
  );
}
