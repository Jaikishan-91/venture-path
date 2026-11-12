"use client";

import { useActionState } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import type { ChallengeStatus } from "@/lib/v2/types";
import { challengeStatusAction, type FormState } from "./actions";

const CONFIRM: Record<string, string> = {
  delete: "Delete this draft? This can't be undone.",
  stop: "Stop taking submissions now, before the deadline?",
  close: "Close the challenge? Students who weren't picked will be told by email.",
};

/** Publish / stop submissions / close / delete, depending on the status. */
export function StatusButtons({ id, status }: { id: string; status: ChallengeStatus }) {
  const [state, action, pending] = useActionState<FormState, FormData>(challengeStatusAction, {
    status: "idle",
  });
  useActionErrorToast(state);

  const button = (value: string, label: string, variant: "default" | "outline" | "destructive") => (
    <form
      action={action}
      onSubmit={(event) => {
        if (CONFIRM[value] && !window.confirm(CONFIRM[value])) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={value} />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {label}
      </Button>
    </form>
  );

  return (
    <>
      {status === "draft" && button("publish", "Publish", "default")}
      {status === "draft" && button("delete", "Delete draft", "destructive")}
      {status === "open" && button("stop", "Stop submissions now", "outline")}
      {status === "judging" && button("close", "Close challenge", "default")}
    </>
  );
}
