"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REJECTION_REASON } from "@/lib/msme-review-schema";
import type { MsmeStatus } from "@/lib/profile-schemas";
import { reviewMsmeAction, type ReviewFormState } from "./actions";

export function ReviewActions({
  profileId,
  profileUpdatedAt,
  status,
}: {
  profileId: string;
  profileUpdatedAt: string;
  status: MsmeStatus;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(reviewMsmeAction, {
    status: "idle",
  });
  const reasonId = `reason-${profileId}`;

  return (
    <div className="flex flex-col gap-3">
      {status !== "approved" && (
        <form action={action}>
          <input type="hidden" name="decision" value="approve" />
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="profileUpdatedAt" value={profileUpdatedAt} />
          <Button type="submit" disabled={pending}>
            Approve
          </Button>
        </form>
      )}
      {status !== "rejected" && (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="decision" value="reject" />
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="profileUpdatedAt" value={profileUpdatedAt} />
          <Label htmlFor={reasonId}>Reason for rejecting</Label>
          <Textarea
            id={reasonId}
            name="reason"
            required
            maxLength={MAX_REJECTION_REASON}
            rows={2}
            placeholder="Shown to the MSME"
          />
          <Button type="submit" variant="destructive" disabled={pending} className="self-start">
            {status === "approved" ? "Revoke approval" : "Reject"}
          </Button>
        </form>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
