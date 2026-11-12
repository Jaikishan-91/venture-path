/**
 * What a student sees as the status of one application on My Applications (plan
 * 2026-11-12-hiring-and-ai-interview-v2, Part 1.6). Pure and client-safe. Never uses AI scores.
 */
import type { StageKind } from "./hiring/types";
import type { OfferStatus } from "./v2/types";

export type StudentStatusInput = {
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  offerStatus: OfferStatus | null;
  currentStage: { name: string; kind: StageKind } | null;
  currentStageId: string | null;
  /** Latest AI interview session (status only). */
  interview: {
    stageId: string;
    status: "invited" | "in_progress" | "completed" | "expired";
  } | null;
};

export type StudentStatus =
  | { kind: "applied"; label: "Applied" }
  | {
      kind: "ai_interview";
      label: string;
      interview: "invited" | "in_progress" | "completed" | "expired";
    }
  | { kind: "stage"; label: string }
  | { kind: "offer"; label: "Offer received" }
  | { kind: "offer_declined"; label: "You declined the offer" }
  | { kind: "hired"; label: "Hired" }
  | { kind: "not_selected"; label: "Not selected" }
  | { kind: "withdrawn"; label: "Withdrawn" };

export function studentStatus(input: StudentStatusInput): StudentStatus {
  if (input.status === "withdrawn") return { kind: "withdrawn", label: "Withdrawn" };
  if (input.status === "accepted") return { kind: "hired", label: "Hired" };
  if (input.status === "rejected") return { kind: "not_selected", label: "Not selected" };
  if (input.offerStatus === "pending") return { kind: "offer", label: "Offer received" };
  if (input.offerStatus === "declined") {
    return { kind: "offer_declined", label: "You declined the offer" };
  }
  if (!input.currentStage) return { kind: "applied", label: "Applied" };
  if (input.currentStage.kind === "ai_interview") {
    // An interview of another stage (or none yet) means the invite is still being prepared.
    const interview =
      input.interview && input.interview.stageId === input.currentStageId
        ? input.interview.status
        : "invited";
    return { kind: "ai_interview", label: input.currentStage.name, interview };
  }
  return { kind: "stage", label: input.currentStage.name };
}
