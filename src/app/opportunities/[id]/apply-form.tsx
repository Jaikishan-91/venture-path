"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyAction, type ApplyState } from "./actions";

export function ApplyForm({ opportunityId }: { opportunityId: string }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {
    status: "idle",
  });
  if (state.status === "done")
    return <p className="text-sm">Application sent. The MSME will review it.</p>;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="resume">Resume (PDF, DOC or DOCX, up to 5 MB)</Label>
        <input
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.doc,.docx"
          required
          className="text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" name="note" maxLength={1000} rows={4} />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  );
}
