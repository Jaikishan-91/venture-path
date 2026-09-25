"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { uploadResumeAction, type ResumeFormState } from "./actions";

export function UploadResumeForm() {
  const [state, action, pending] = useActionState<ResumeFormState, FormData>(uploadResumeAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="resume">Add a resume</Label>
        <input
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.doc,.docx"
          required
          className="max-w-full text-sm"
        />
        <p className="text-xs text-muted-foreground">PDF, DOC or DOCX, up to 5 MB.</p>
      </div>
      <Button type="submit" disabled={pending} className="self-start sm:self-auto">
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}

/** Re-render every few seconds while a resume's skills are still being extracted (stops after ~1 min). */
export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  const ticks = useRef(0);
  useEffect(() => {
    if (!pending) {
      ticks.current = 0;
      return;
    }
    const timer = setInterval(() => {
      ticks.current += 1;
      if (ticks.current > 20) clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
