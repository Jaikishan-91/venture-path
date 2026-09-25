"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { OpportunityStatus } from "@/lib/opportunity-schemas";
import { opportunityStatusAction, type StatusFormState } from "./actions";

export function OpportunityActions({
  id,
  status,
  canEdit,
}: {
  id: string;
  status: OpportunityStatus;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<StatusFormState, FormData>(
    opportunityStatusAction,
    { status: "idle" },
  );

  const actionButton = (
    value: string,
    label: string,
    variant: "default" | "outline" | "destructive",
  ) => (
    <form
      action={action}
      onSubmit={(event) => {
        if (value === "delete" && !window.confirm("Delete this draft? This can't be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={value} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {label}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link
            href={`/msme/opportunities/${id}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Edit
          </Link>
        )}
        {status === "draft" && canEdit && actionButton("publish", "Publish", "default")}
        {status === "published" && actionButton("close", "Close", "outline")}
        {status === "closed" && canEdit && actionButton("reopen", "Reopen", "outline")}
        {status === "draft" && actionButton("delete", "Delete draft", "destructive")}
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
