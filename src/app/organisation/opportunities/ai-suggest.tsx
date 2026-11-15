"use client";

import { Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { assistOpportunityAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} className="shrink-0">
      <Sparkles strokeWidth={1.75} aria-hidden />
      {pending ? "Asking AI…" : "Suggest with AI"}
    </Button>
  );
}

/** Re-run the listing assist from the edit page. Saved values only: unsaved edits are not sent. */
export function AiSuggest({ id, canDraftQuestions }: { id: string; canDraftQuestions: boolean }) {
  return (
    <form
      action={assistOpportunityAction}
      className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="id" value={id} />
      <p className="flex items-start gap-2.5 text-[13px] text-[#525252]">
        <Sparkles
          aria-hidden
          strokeWidth={1.75}
          className="mt-0.5 size-4 shrink-0 text-[#a3a3a3]"
        />
        <span>
          AI adds missing skills from your description
          {canDraftQuestions ? " and drafts screening questions" : ""}. Save your edits first.
        </span>
      </p>
      <SubmitButton />
    </form>
  );
}
