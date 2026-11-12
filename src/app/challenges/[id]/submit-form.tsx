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
      <div className="flex flex-col gap-2">
        <Label htmlFor="text">Your solution</Label>
        <Textarea
          id="text"
          name="text"
          defaultValue={initial?.text}
          required
          maxLength={MAX_SUBMISSION_TEXT_LENGTH}
          rows={8}
          placeholder="Explain your idea and how the business can use it."
        />
      </div>
      <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">File (optional)</Label>
        {initial?.fileName && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              href={`/api/challenge-submissions/${initial.submissionId}/file`}
              className="break-all underline"
            >
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
          PDF, Word, Excel, CSV, PowerPoint, PNG or JPG, up to 5 MB.
        </p>
      </div>
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Sending…" : initial ? "Update solution" : "Submit solution"}
      </Button>
    </form>
  );
}
