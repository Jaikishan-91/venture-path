"use client";

import { Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { assistOpportunityAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
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
      className="flex flex-col gap-2 rounded-xl bg-[#f7f7f9] p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-[#4a4d53]">
        AI adds missing skills from your description
        {canDraftQuestions ? " and drafts screening questions" : ""}. Save your edits first.
      </p>
      <SubmitButton />
    </form>
  );
}
