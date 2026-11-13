"use client";

import { useActionState } from "react";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_HIRE_MESSAGE_LENGTH,
  type ChallengePlacement,
  type ChallengeStatus,
  type RewardStatus,
} from "@/lib/v2/types";
import { decisionAction, type FormState } from "../../actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm";

/** Pick as winner / runner-up, then the reward step. Shown to the owning organisation only. */
export function DecisionPanel({
  challengeId,
  submissionId,
  challengeStatus,
  placement,
  rewardStatus,
  rewardMoney,
  rewardHire,
  listings,
}: {
  challengeId: string;
  submissionId: string;
  challengeStatus: ChallengeStatus;
  placement: ChallengePlacement;
  rewardStatus: RewardStatus;
  /** Formatted money reward, or null. */
  rewardMoney: string | null;
  rewardHire: boolean;
  listings: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(decisionAction, {
    status: "idle",
  });
  useActionErrorToast(state);
  const judging = challengeStatus === "judging";

  const hidden = (
    <>
      <input type="hidden" name="challengeId" value={challengeId} />
      <input type="hidden" name="submissionId" value={submissionId} />
    </>
  );
  const placementButton = (value: ChallengePlacement, label: string, primary = false) => (
    <form action={action}>
      {hidden}
      <input type="hidden" name="action" value="placement" />
      <input type="hidden" name="placement" value={value} />
      <Button type="submit" size="sm" variant={primary ? "default" : "outline"} disabled={pending}>
        {label}
      </Button>
    </form>
  );

  const moneyDue = placement === "winner" && rewardMoney !== null && rewardStatus === "none";
  const canOfferHire =
    rewardHire && placement !== "none" && rewardStatus !== "hire_offered" && !moneyDue;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 border border-[#e5e5e5] shadow-card">
      <h2 className="text-lg font-medium">Your decision</h2>
      {challengeStatus === "open" && (
        <p className="text-sm text-muted-foreground">
          You can pick a winner once submissions close (at the deadline, or stop them early).
        </p>
      )}
      {challengeStatus === "done" && (
        <p className="text-sm text-muted-foreground">This challenge is closed.</p>
      )}
      {judging && rewardStatus === "none" && (
        <div className="flex flex-wrap gap-2">
          {placement !== "winner" && placementButton("winner", "Pick as winner", true)}
          {placement !== "runner_up" && placementButton("runner_up", "Runner-up")}
          {placement !== "none" && placementButton("none", "Remove placement")}
        </div>
      )}

      {placement !== "none" && (
        <div className="flex flex-col gap-3 text-sm">
          <h3 className="font-medium">Reward</h3>
          {placement === "winner" && rewardMoney !== null && (
            <div className="flex flex-wrap items-center gap-3">
              <span>Money: {rewardMoney}</span>
              {rewardStatus === "none" ? (
                judging && (
                  <form action={action}>
                    {hidden}
                    <input type="hidden" name="action" value="paid" />
                    <Button type="submit" size="sm" disabled={pending}>
                      Marked as paid
                    </Button>
                  </form>
                )
              ) : (
                <span className="rounded-md bg-[#e6f9ef] px-2 py-0.5 text-xs text-[#00994f]">
                  Paid
                </span>
              )}
            </div>
          )}
          {placement === "winner" && rewardMoney !== null && rewardStatus === "none" && (
            <p className="text-xs text-muted-foreground">
              Pay the student directly (UPI or cash), then mark it here.
            </p>
          )}
          {rewardHire && rewardStatus === "hire_offered" && (
            <p>
              <span className="rounded-md bg-[#e6f9ef] px-2 py-0.5 text-xs text-[#00994f]">
                Hire offer sent
              </span>
            </p>
          )}
          {rewardHire && moneyDue && (
            <p className="text-xs text-muted-foreground">
              Mark the money as paid, then offer the hire.
            </p>
          )}
          {judging && canOfferHire && (
            <form action={action} className="flex flex-col gap-3">
              {hidden}
              <input type="hidden" name="action" value="hire" />
              <div className="flex flex-col gap-2">
                <Label htmlFor="message">Offer hire: your message to the student</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={3}
                  maxLength={MAX_HIRE_MESSAGE_LENGTH}
                  placeholder="e.g. We'd like you to join us as a social media intern."
                />
              </div>
              {listings.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="opportunityId">Link a job listing (optional)</Label>
                  <select id="opportunityId" name="opportunityId" className={selectClass}>
                    <option value="">No listing</option>
                    {listings.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button type="submit" size="sm" className="self-start" disabled={pending}>
                Offer hire
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
