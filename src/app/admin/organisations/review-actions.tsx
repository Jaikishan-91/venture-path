"use client";

import { useActionErrorToast } from "@/components/use-action-error-toast";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REJECTION_REASON } from "@/lib/organisation-review-schema";
import type { OrganisationStatus } from "@/lib/profile-schemas";
import { reviewOrganisationAction, type ReviewFormState } from "./actions";

export function ReviewActions({
  profileId,
  profileUpdatedAt,
  status,
}: {
  profileId: string;
  profileUpdatedAt: string;
  status: OrganisationStatus;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    reviewOrganisationAction,
    {
      status: "idle",
    },
  );
  useActionErrorToast(state);
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
            placeholder="Shown to the organisation"
          />
          <Button type="submit" variant="destructive" disabled={pending} className="self-start">
            {status === "approved" ? "Revoke approval" : "Reject"}
          </Button>
        </form>
      )}
    </div>
  );
}
