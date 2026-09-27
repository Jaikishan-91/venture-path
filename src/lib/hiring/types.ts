/**
 * Shared contract for hiring pipelines, scheduling and hiring managers
 * (plan `plan/2026-09-26-hiring-pipelines-and-interviews.md`, ADR-035 to ADR-037).
 * Types and limits only, so it is safe to import from client and server code.
 */

export type Ok<T = object> = { ok: true } & T;
export type Fail<R extends string> = { ok: false; reason: R; message?: string };
export type Result<T, R extends string> = Ok<T> | Fail<R>;

// ---------------------------------------------------------------------------------------------
// Pipeline stages (WP2: `src/lib/pipeline-schemas.ts`, `src/lib/pipelines.ts`, `pipeline-assist.ts`)
// ---------------------------------------------------------------------------------------------

export const STAGE_KINDS = ["interview", "test", "assignment", "other"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  interview: "Interview",
  test: "Test",
  assignment: "Assignment",
  other: "Other",
};

/** Kinds that get a Google Meet link when scheduled. Other kinds get a calendar event only. */
export const MEET_STAGE_KINDS: readonly StageKind[] = ["interview"];

export const MAX_STAGES = 10;
export const MAX_STAGE_NAME_LENGTH = 60;
export const MAX_STAGE_INSTRUCTIONS_LENGTH = 1000;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480;
export const DEFAULT_DURATION_MINUTES = 45;

/** One stage as edited in the pipeline editor. `id` is absent for new stages. */
export type StageInput = {
  id?: string;
  name: string;
  kind: StageKind;
  instructions: string | null;
  externalUrl: string | null;
  durationMinutes: number | null;
  source: "ai" | "organisation";
};

/** A stored stage plus the facts the soft-lock (ADR-037) needs. */
export type PipelineStageView = StageInput & {
  id: string;
  position: number;
  /** Applications currently at this stage. */
  candidateCount: number;
  /** True when any candidate is or was at this stage (current, history or scheduled event). */
  reached: boolean;
};

export type PipelineFailure =
  | "not_found"
  | "not_approved"
  | "invalid"
  /** A reached stage would be deleted or moved (ADR-037). */
  | "locked_stage"
  /** The pipeline changed since the editor loaded it. */
  | "stale";

// ---------------------------------------------------------------------------------------------
// Team / hiring managers (WP1: `src/lib/team.ts`)
// ---------------------------------------------------------------------------------------------

export const INVITE_TTL_DAYS = 7;
export const MAX_PENDING_INVITES = 20;
export const MAX_MEMBER_NAME_LENGTH = 100;

export type MemberStatus = "invited" | "active" | "deactivated";

export type MemberView = {
  id: string;
  name: string;
  email: string;
  status: MemberStatus;
  /** Invite expired and not accepted (status stays `invited`). */
  expired: boolean;
  invitedAt: Date;
  acceptedAt: Date | null;
};

export type InviteFailure =
  | "not_found"
  | "invalid"
  | "already_member"
  | "too_many_pending"
  /** The email belongs to the organisation owner themselves. */
  | "own_email";

export type AcceptInviteFailure =
  | "invalid"
  | "expired"
  | "email_mismatch"
  /** The signed-in account already has another role (one role per account, ADR-013). */
  | "other_role"
  /** The account is already a member of another organisation. */
  | "member_elsewhere";

/** Someone who can be put on an interview: the organisation owner or an active hiring manager. */
export type InterviewerOption = {
  userId: string;
  name: string;
  kind: "owner" | "hiring_manager";
};

// ---------------------------------------------------------------------------------------------
// Google Calendar (WP3: `src/lib/google-calendar.ts`)
// ---------------------------------------------------------------------------------------------

export type CalendarAttendee = { email: string; name?: string };

export type CalendarEventInput = {
  /** Idempotency key for Meet creation; use the ScheduledEvent id. */
  requestId: string;
  summary: string;
  description: string;
  startsAt: Date;
  durationMinutes: number;
  attendees: CalendarAttendee[];
  withMeet: boolean;
};

export type CalendarFailure = "disabled" | "auth" | "http" | "timeout" | "network";

export type CalendarEventResult = Result<
  { eventId: string; meetUrl: string | null; htmlLink: string | null },
  CalendarFailure
>;

// ---------------------------------------------------------------------------------------------
// Progression and scheduling (WP4: `src/lib/pipeline-progress.ts`, `src/lib/scheduling.ts`)
// ---------------------------------------------------------------------------------------------

export type ProgressFailure =
  | "not_found"
  /** The candidate's stage or status changed since the page loaded. */
  | "stale"
  /** The listing has no pipeline, or the target stage is not in it. */
  | "invalid";

export type ScheduleInput = {
  applicationId: string;
  stageId: string;
  /** `YYYY-MM-DDTHH:mm` in India time (Asia/Kolkata), as sent by `<input type="datetime-local">`. */
  startsAtLocal: string;
  durationMinutes: number;
  interviewerUserIds: string[];
};

export type ScheduleFailure =
  | "not_found"
  | "invalid"
  | "in_past"
  /** The candidate is not at that stage, or the application is not `submitted`. */
  | "wrong_stage"
  /** An interviewer is not the owner or an active hiring manager of this organisation. */
  | "bad_interviewer"
  | "stale";

export const SCHEDULE_STATUS_LABELS = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  completed: "Completed",
} as const;

// ---------------------------------------------------------------------------------------------
// Feedback (WP5: `src/lib/interview-feedback.ts`)
// ---------------------------------------------------------------------------------------------

export const RECOMMENDATIONS = ["pass", "fail", "unsure"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  pass: "Pass",
  fail: "Fail",
  unsure: "Unsure",
};
export const MAX_FEEDBACK_NOTES_LENGTH = 2000;

export type FeedbackInput = { rating: number; recommendation: Recommendation; notes: string };

export type FeedbackFailure = "not_found" | "invalid" | "not_yet" | "cancelled";
