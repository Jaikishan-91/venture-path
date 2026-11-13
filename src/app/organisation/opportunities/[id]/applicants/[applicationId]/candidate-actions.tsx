"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionErrorToast } from "@/components/use-action-error-toast";
import { nextStepLabel, type NextStep } from "@/lib/hiring-board";
import {
  MAX_NOT_SELECTED_REASON_LENGTH,
  MAX_OFFER_MESSAGE_LENGTH,
  MAX_OFFER_STIPEND_INR,
} from "@/lib/v2/types";
import {
  advanceAction,
  makeOfferAction,
  notSelectedAction,
  withdrawOfferAction,
  type FormActionState,
} from "../actions";

const IDLE: FormActionState = { status: "idle" };

function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-medium">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

function OfferForm({
  applicationId,
  minStartDate,
  onDone,
  onCancel,
}: {
  applicationId: string;
  minStartDate: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(makeOfferAction, IDLE);
  useActionErrorToast(state);
  useEffect(() => {
    if (state.status === "done") onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offer-message">Message to the student</Label>
        <Textarea
          id="offer-message"
          name="message"
          required
          maxLength={MAX_OFFER_MESSAGE_LENGTH}
          rows={4}
          defaultValue="We enjoyed talking to you and would like you to join us."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-stipend">Stipend (₹ / month, optional)</Label>
          <Input
            id="offer-stipend"
            name="stipendInr"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_OFFER_STIPEND_INR}
            step={1}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="offer-start">Start date (optional)</Label>
          <Input id="offer-start" name="startDate" type="date" min={minStartDate} />
        </div>
      </div>
      <p className="text-xs text-[#737373]">
        The student gets an email and answers in the app. You&apos;ll get an email when they do.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send offer"}
        </Button>
      </div>
    </form>
  );
}

function NotSelectedForm({
  applicationId,
  expectedStageId,
  onDone,
  onCancel,
}: {
  applicationId: string;
  expectedStageId: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(notSelectedAction, IDLE);
  useActionErrorToast(state);
  useEffect(() => {
    if (state.status === "done") onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="expectedStageId" value={expectedStageId ?? ""} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="not-selected-reason">A kind note for the student (optional)</Label>
        <Textarea
          id="not-selected-reason"
          name="reason"
          rows={3}
          maxLength={MAX_NOT_SELECTED_REASON_LENGTH}
          placeholder="e.g. We picked someone with more Instagram experience. Keep building!"
        />
      </div>
      <p className="text-xs text-[#737373]">
        They get a polite email with your note. This can&apos;t be undone.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Mark not selected"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The candidate page's one action bar (H3): the next step ("Move to …" / "Send AI interview" /
 * "Make offer", or the pending offer's "Withdraw offer") and "Not selected" with an optional
 * kind reason. Sticky at the bottom so it stays in reach on a phone.
 */
export function CandidateActionBar({
  applicationId,
  currentStageId,
  nextStep,
  canMarkNotSelected,
  openOffer,
  minStartDate,
}: {
  applicationId: string;
  currentStageId: string | null;
  nextStep: NextStep;
  canMarkNotSelected: boolean;
  /** Open the offer dialog on load (`?offer=1` from the board's "Make offer"). */
  openOffer: boolean;
  minStartDate: string;
}) {
  const [dialog, setDialog] = useState<"offer" | "not_selected" | null>(
    openOffer && (nextStep.kind === "make_offer" || nextStep.kind === "offer_declined")
      ? "offer"
      : null,
  );
  const close = () => setDialog(null);
  const label = nextStepLabel(nextStep);
  if (nextStep.kind === "none") return null;

  return (
    <>
      <div
        role="region"
        aria-label="Decide"
        className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)]"
      >
        {(nextStep.kind === "move" || nextStep.kind === "send_ai_interview") && (
          <form action={advanceAction}>
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="expectedStageId" value={currentStageId ?? ""} />
            <input type="hidden" name="nextKind" value={nextStep.stage.kind} />
            <Button type="submit">{label}</Button>
          </form>
        )}
        {(nextStep.kind === "make_offer" || nextStep.kind === "offer_declined") && (
          <Button type="button" onClick={() => setDialog("offer")}>
            {label}
          </Button>
        )}
        {nextStep.kind === "offer_pending" && (
          <>
            <span className="text-sm text-[#737373]">Waiting for the student to answer.</span>
            <form action={withdrawOfferAction}>
              <input type="hidden" name="applicationId" value={applicationId} />
              <Button type="submit" variant="outline">
                Withdraw offer
              </Button>
            </form>
          </>
        )}
        {canMarkNotSelected && (
          <Button type="button" variant="outline" onClick={() => setDialog("not_selected")}>
            Not selected
          </Button>
        )}
      </div>

      <Dialog open={dialog === "offer"} onClose={close} title="Make offer">
        {dialog === "offer" && (
          <OfferForm
            applicationId={applicationId}
            minStartDate={minStartDate}
            onDone={close}
            onCancel={close}
          />
        )}
      </Dialog>
      <Dialog open={dialog === "not_selected"} onClose={close} title="Not selected">
        {dialog === "not_selected" && (
          <NotSelectedForm
            applicationId={applicationId}
            expectedStageId={currentStageId}
            onDone={close}
            onCancel={close}
          />
        )}
      </Dialog>
    </>
  );
}
