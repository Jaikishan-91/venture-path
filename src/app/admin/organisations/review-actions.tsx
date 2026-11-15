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
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      {status !== "rejected" && (
        <form action={action} className="flex min-w-0 flex-1 flex-col gap-2">
          <input type="hidden" name="decision" value="reject" />
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="profileUpdatedAt" value={profileUpdatedAt} />
          <Label htmlFor={reasonId}>Reason for rejecting</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              id={reasonId}
              name="reason"
              required
              maxLength={MAX_REJECTION_REASON}
              rows={2}
              placeholder="Shown to the organisation"
              className="min-h-10 flex-1 bg-white"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={pending}
              className="shrink-0 border-[#fecaca]! text-[#b91c1c] hover:bg-[#fef2f2]"
            >
              {status === "approved" ? "Revoke approval" : "Reject"}
            </Button>
          </div>
        </form>
      )}
      {status !== "approved" && (
        <form action={action} className="shrink-0">
          <input type="hidden" name="decision" value="approve" />
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="profileUpdatedAt" value={profileUpdatedAt} />
          <Button type="submit" disabled={pending} className="w-full md:w-auto">
            Approve
          </Button>
        </form>
      )}
    </div>
  );
}
