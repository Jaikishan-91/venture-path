"use client";

import { startTransition, useActionState } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_SUBMISSION_LINK_LENGTH } from "@/lib/challenge-schemas";
import { MAX_SUBMISSION_TEXT_LENGTH } from "@/lib/v2/types";
import { submitSolutionAction, type SubmitState } from "./actions";

/** One "Submit solution" box: text, plus an optional link or file. Also used to edit. */
export function SubmitForm({
  challengeId,
  initial,
}: {
  challengeId: string;
  initial: { text: string; link: string; fileName: string | null; submissionId: string } | null;
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitSolutionAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Keep what the student typed if the save fails (no automatic form reset).
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="challengeId" value={challengeId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="text">Your solution</Label>
        <Textarea
          id="text"
          name="text"
          defaultValue={initial?.text}
          required
          maxLength={MAX_SUBMISSION_TEXT_LENGTH}
          rows={8}
          aria-describedby="text-hint"
          placeholder="Explain your idea and how the business can use it."
        />
        <p id="text-hint" className="text-[12px] text-[#737373]">
          Be specific: what you would do, and what result the business can expect.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="link">Link (optional)</Label>
        <Input
          id="link"
          name="link"
          type="url"
          defaultValue={initial?.link}
          maxLength={MAX_SUBMISSION_LINK_LENGTH}
          placeholder="https://"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">File (optional)</Label>
        {initial?.fileName && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-[13px]">
            <a
              href={`/api/challenge-submissions/${initial.submissionId}/file`}
              className="min-w-0 break-all text-[#121212] underline underline-offset-4"
            >
              {initial.fileName}
            </a>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[#525252]">
              <input type="checkbox" name="removeFile" className="size-4 accent-[#16a34a]" /> Remove
            </label>
          </div>
        )}
        <input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
          aria-describedby="file-hint"
          className="max-w-full cursor-pointer rounded-lg border border-dashed border-[#d4d4d4] bg-white p-2 text-[13px] text-[#525252] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#f5f5f5] file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[#121212] hover:border-[#a3a3a3]"
        />
        <p id="file-hint" className="text-[12px] text-[#737373]">
          PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : initial ? "Update solution" : "Submit solution"}
      </Button>
    </form>
  );
}
