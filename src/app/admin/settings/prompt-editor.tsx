"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePromptAction, type SettingsFormState } from "./actions";

/** One prompt as a settings row: name and key on the left, the template editor on the right. */
export function PromptEditor({
  prompt,
}: {
  prompt: { key: string; name: string; content: string };
}) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(savePromptAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  return (
    <form
      action={action}
      className="grid gap-4 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8"
    >
      <input type="hidden" name="key" value={prompt.key} />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-[14px] font-semibold text-[#121212]">{prompt.name}</h3>
        <p className="text-[12px] text-[#737373]">
          Key:{" "}
          <code className="rounded bg-[#f5f5f5] px-1 py-0.5 font-mono text-[12px] break-all text-[#404040]">
            {prompt.key}
          </code>
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`content-${prompt.key}`}>Prompt template</Label>
        <Textarea
          id={`content-${prompt.key}`}
          name="content"
          defaultValue={prompt.content}
          required
          maxLength={10_000}
          rows={12}
          className="bg-[#fafafa] font-mono text-[13px] leading-relaxed"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-[#a3a3a3]">Up to 10,000 characters.</p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
