"use client";

import { Upload } from "lucide-react";
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
    <form action={action} className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="resume">Add a resume</Label>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] bg-[#fafafa] px-4 py-5 text-center">
          <Upload aria-hidden className="size-5 text-[#a3a3a3]" />
          <input
            id="resume"
            name="resume"
            type="file"
            accept=".pdf,.doc,.docx"
            required
            className="w-full max-w-full text-[13px] text-[#525252] file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-[#d4d4d4] file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-[#121212]"
          />
          <p className="text-[12px] text-[#737373]">PDF, DOC or DOCX, up to 5 MB.</p>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
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
