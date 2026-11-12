import { Prisma } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { visibleOpportunityWhere } from "./search";
import { cancelFutureEventsForApplication } from "./scheduling";
import type { ResumeExtension } from "./resumes";
import { analyzeApplication } from "./resume-analysis";
import { addResume, deleteStoredFileIfUnreferenced } from "./resume-library";
import { MAX_APPLICATION_PROOFS, MAX_APPLY_TASK_ANSWER_LENGTH } from "./v2/types";

type TxClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

export const MAX_NOTE_LENGTH = 1000;

export type ApplyFailure =
  | "needs_profile"
  | "not_open"
  | "already_applied"
  | "resume_not_found"
  | "resume_limit"
  | "answers_mismatch"
  /** Neither a proof card nor a resume (docs/PRODUCT.md Module 4). */
  | "needs_evidence"
  /** A picked proof card isn't the applicant's, or more than the limit were picked. */
  | "proof_not_found"
  /** The listing has an apply task and the answer is missing or too long. */
  | "task_required";
export type ApplyResult = { ok: true; id: string } | { ok: false; reason: ApplyFailure };

export type DecisionFailure = "not_found" | "invalid_state";
export type DecisionResult = { ok: true } | { ok: false; reason: DecisionFailure };

const noteOrNull = (note: string) => {
  const trimmed = note.trim();
  return trimmed ? trimmed.slice(0, MAX_NOTE_LENGTH) : null;
};

/** A library resume by ID, or a new upload that is added to the library (ADR-031). */
export type ApplyResume =
  { resumeId: string } | { fileName: string; extension: ResumeExtension; bytes: Buffer };

/** No resume: the application relies on proof cards (docs/PRODUCT.md Module 4). */
type NoResume = { resumeId?: undefined; bytes?: undefined };

export type ApplyInput = {
  note: string;
  answers?: Record<string, string>;
  /** The applicant's own proof cards to attach (at most MAX_APPLICATION_PROOFS). */
  proofIds?: string[];
  /** Answer to the listing's apply task; required when the listing has one. */
  taskAnswer?: string;
} & (ApplyResume | NoResume);

/**
 * Apply to a visible listing with proof cards and/or a resume (at least one), answers to all of
 * its screening questions (keyed by question ID), and the apply task answer when it has one (saved
 * as an `apply_task` proof card and attached). A withdrawn application is resubmitted in place,
 * replacing its answers and attached proof cards.
 */
export async function applyToOpportunity(
  applicantUserId: string,
  opportunityId: string,
  input: ApplyInput,
): Promise<ApplyResult> {
  const db = getDb();
  const profile = await db.userProfile.findUnique({ where: { userId: applicantUserId } });
  if (!profile) return { ok: false, reason: "needs_profile" };

  const open = await db.opportunity.findFirst({
    where: { id: opportunityId, ...visibleOpportunityWhere() },
    select: { id: true, title: true, applyTask: true, questions: { select: { id: true } } },
  });
  if (!open) return { ok: false, reason: "not_open" };

  const taskAnswer = input.taskAnswer?.trim() ?? "";
  if (open.applyTask && (!taskAnswer || taskAnswer.length > MAX_APPLY_TASK_ANSWER_LENGTH)) {
    return { ok: false, reason: "task_required" };
  }
  const proofIds = [...new Set(input.proofIds ?? [])];
  if (proofIds.length > MAX_APPLICATION_PROOFS) return { ok: false, reason: "proof_not_found" };
  if (proofIds.length > 0) {
    const owned = await db.proof.count({
      where: { id: { in: proofIds }, userProfileId: profile.id },
    });
    if (owned !== proofIds.length) return { ok: false, reason: "proof_not_found" };
  }
  const hasResume =
    ("resumeId" in input && Boolean(input.resumeId)) || ("bytes" in input && Boolean(input.bytes));
  if (!hasResume && proofIds.length === 0 && !open.applyTask) {
    return { ok: false, reason: "needs_evidence" };
  }

  const answers = input.answers ?? {};
  const questionIds = open.questions.map((question) => question.id);
  if (
    Object.keys(answers).length !== questionIds.length ||
    questionIds.some((id) => !answers[id]?.trim())
  ) {
    return { ok: false, reason: "answers_mismatch" };
  }

  const existing = await db.application.findUnique({
    where: { opportunityId_userProfileId: { opportunityId, userProfileId: profile.id } },
  });
  if (existing && existing.status !== "withdrawn") return { ok: false, reason: "already_applied" };

  let resume: { id: string; fileName: string; storageKey: string } | null = null;
  if ("resumeId" in input && input.resumeId) {
    const found = await db.resume.findFirst({
      where: { id: input.resumeId, userProfileId: profile.id },
      select: { id: true, fileName: true, storageKey: true },
    });
    if (!found) return { ok: false, reason: "resume_not_found" };
    resume = found;
  } else if ("bytes" in input && input.bytes) {
    const added = await addResume(applicantUserId, input);
    if (!added.ok)
      return { ok: false, reason: added.reason === "limit" ? "resume_limit" : "needs_profile" };
    resume = added.resume;
  }

  const data = {
    note: noteOrNull(input.note),
    resumeId: resume?.id ?? null,
    resumeFileName: resume?.fileName ?? null,
    resumeStorageKey: resume?.storageKey ?? null,
    status: "submitted" as const,
    appliedAt: new Date(),
    decidedAt: null,
  };
  const answerRows = questionIds.map((questionId) => ({
    questionId,
    answer: answers[questionId].trim(),
  }));

  let applicationId: string;
  try {
    applicationId = await db.$transaction(async (tx) => {
      const taskProofId = open.applyTask
        ? await saveTaskProof(tx, {
            userProfileId: profile.id,
            applicationId: existing?.id ?? null,
            title: `Task: ${open.title}`,
            answer: taskAnswer,
          })
        : null;
      const attached = [...proofIds, ...(taskProofId ? [taskProofId] : [])].map((id) => ({ id }));
      if (!existing) {
        const created = await tx.application.create({
          data: {
            ...data,
            opportunityId,
            userProfileId: profile.id,
            answers: { create: answerRows },
            proofs: { connect: attached },
          },
          select: { id: true },
        });
        return created.id;
      }
      const { count } = await tx.application.updateMany({
        where: { id: existing.id, status: "withdrawn" },
        data,
      });
      if (count === 0) throw new AlreadyApplied();
      await tx.application.update({
        where: { id: existing.id },
        data: { proofs: { set: attached } },
      });
      await tx.analysis.deleteMany({ where: { applicationId: existing.id } });
      await tx.applicationAnswer.deleteMany({ where: { applicationId: existing.id } });
      await tx.applicationAnswer.createMany({
        data: answerRows.map((row) => ({ ...row, applicationId: existing.id })),
      });
      return existing.id;
    });
  } catch (err) {
    if (
      err instanceof AlreadyApplied ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    ) {
      return { ok: false, reason: "already_applied" };
    }
    // The questions changed between the check and the insert (answer FK to a deleted question).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { ok: false, reason: "answers_mismatch" };
    }
    throw err;
  }

  if (existing?.resumeStorageKey && existing.resumeStorageKey !== resume?.storageKey) {
    await deleteStoredFileIfUnreferenced(existing.resumeStorageKey);
  }
  getLogger().info(
    { userId: applicantUserId, applicationId, opportunityId, resubmitted: Boolean(existing) },
    existing ? "application resubmitted" : "application submitted",
  );
  runInBackground("application email", { applicationId }, () => notifyOrganisation(applicationId));
  // Never awaited: a failed analysis does not block applying.
  runInBackground("application analysis", { applicationId }, () =>
    analyzeApplication(applicationId),
  );
  return { ok: true, id: applicationId };
}

class AlreadyApplied extends Error {}

/**
 * The apply task answer as an `apply_task` proof card. On resubmit the card already attached to
 * the application is updated in place instead of adding another. No AI check runs on it.
 */
async function saveTaskProof(
  tx: Prisma.TransactionClient,
  input: { userProfileId: string; applicationId: string | null; title: string; answer: string },
): Promise<string> {
  const data = {
    title: input.title.slice(0, 120),
    whatIDid: input.answer,
    level: "added" as const,
    aiScoreStatus: "skipped" as const,
  };
  const previous = input.applicationId
    ? await tx.proof.findFirst({
        where: {
          source: "apply_task",
          userProfileId: input.userProfileId,
          applications: { some: { id: input.applicationId } },
        },
        select: { id: true },
      })
    : null;
  if (previous) {
    await tx.proof.update({ where: { id: previous.id }, data });
    return previous.id;
  }
  const created = await tx.proof.create({
    data: { ...data, userProfileId: input.userProfileId, source: "apply_task", skills: [] },
    select: { id: true },
  });
  return created.id;
}

export async function withdrawApplication(
  applicantUserId: string,
  applicationId: string,
): Promise<DecisionResult> {
  const { count } = await getDb().application.updateMany({
    where: { id: applicationId, status: "submitted", userProfile: { userId: applicantUserId } },
    data: { status: "withdrawn" },
  });
  if (count === 0) return { ok: false, reason: "invalid_state" };
  getLogger().info({ userId: applicantUserId, applicationId }, "application withdrawn");
  runInBackground("cancel future events", { applicationId }, () =>
    cancelFutureEventsForApplication(applicationId),
  );
  return { ok: true };
}

/** A pending offer blocks a reject: withdraw it first (plan 2026-11-12-hiring-and-ai-interview-v2). */
export const NO_PENDING_OFFER: Prisma.ApplicationWhereInput = {
  OR: [{ offerStatus: null }, { offerStatus: { in: ["accepted", "declined", "withdrawn"] } }],
};

/**
 * Marks a `submitted` application "Not selected", conditional on `where` (which the caller
 * composes for its own optimistic-concurrency check), inside a transaction it controls. Internal
 * helper shared by `decideApplication` and `pipeline-progress.ts` (ADR-037: pipeline wraps the
 * reject), so the decision write and its StageEvent (when any) commit together. Never matches an
 * application with a pending offer. Returns the row count updated (0 or 1); callers decide what a
 * miss means (`invalid_state` vs `stale`). Hiring ("accepted") only happens when the student
 * accepts an offer (`offers.ts`).
 */
export async function decideApplicationTx(
  tx: TxClient,
  where: Prisma.ApplicationWhereInput,
  decision: "rejected",
  notSelectedReason: string | null = null,
): Promise<number> {
  const { count } = await tx.application.updateMany({
    where: { AND: [where, { status: "submitted" }, NO_PENDING_OFFER] },
    data: { status: decision, decidedAt: new Date(), notSelectedReason },
  });
  return count;
}

/** Trimmed "Not selected" reason, or null when empty. Callers validate the length first. */
export const reasonOrNull = (reason: string | null | undefined) => {
  const trimmed = reason?.trim() ?? "";
  return trimmed ? trimmed : null;
};

/** The "Not selected" email (with the kind reason, when given), shared with `pipeline-progress.ts`. */
export async function notifyApplicationDecision(
  applicationId: string,
  decision: "rejected",
): Promise<void> {
  await notifyUser(applicationId, decision);
}

/** "Not selected" for listings without hiring steps (with steps, `failCandidate` is used). */
export async function decideApplication(
  organisationUserId: string,
  applicationId: string,
  decision: "rejected",
  notSelectedReason: string | null = null,
): Promise<DecisionResult> {
  const count = await decideApplicationTx(
    getDb(),
    { id: applicationId, opportunity: { organisationProfile: { userId: organisationUserId } } },
    decision,
    reasonOrNull(notSelectedReason),
  );
  if (count === 0) return { ok: false, reason: "invalid_state" };
  getLogger().info(
    { userId: organisationUserId, applicationId, status: decision },
    "application decided",
  );
  runInBackground("application decision email", { applicationId }, () =>
    notifyApplicationDecision(applicationId, decision),
  );
  runInBackground("cancel future events", { applicationId }, () =>
    cancelFutureEventsForApplication(applicationId),
  );
  return { ok: true };
}

async function notifyOrganisation(applicationId: string) {
  const logger = getLogger();
  try {
    const application = await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        opportunity: {
          select: {
            id: true,
            title: true,
            organisationProfile: { select: { user: { select: { email: true } } } },
          },
        },
        userProfile: { select: { user: { select: { name: true } } } },
      },
    });
    const url = `${getEnv().BETTER_AUTH_URL}/organisation/opportunities/${application.opportunity.id}/applicants`;
    await sendEmail({
      to: application.opportunity.organisationProfile.user.email,
      subject: `New application for ${application.opportunity.title}`,
      text: `${application.userProfile.user.name} applied to ${application.opportunity.title}.\n\nReview applicants:\n${url}`,
    });
    logger.info({ applicationId }, "application email sent");
  } catch (err) {
    logger.error({ applicationId, err }, "application email failed");
  }
}

async function notifyUser(applicationId: string, decision: "rejected") {
  const logger = getLogger();
  try {
    const application = await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        notSelectedReason: true,
        opportunity: {
          select: {
            title: true,
            organisationProfile: { select: { businessName: true } },
          },
        },
        userProfile: { select: { user: { select: { email: true } } } },
      },
    });
    const url = `${getEnv().BETTER_AUTH_URL}/user/applications`;
    const business = application.opportunity.organisationProfile;
    const reason = application.notSelectedReason
      ? `\n\nA note from them:\n${application.notSelectedReason}`
      : "";
    await sendEmail({
      to: application.userProfile.user.email,
      subject: `Application update: ${application.opportunity.title}`,
      text: `Thank you for applying to ${application.opportunity.title}. ${business.businessName} has chosen not to go ahead with your application this time.${reason}\n\nKeep adding proof of your work and applying. Your applications:\n${url}`,
    });
    logger.info({ applicationId, status: decision }, "application decision email sent");
  } catch (err) {
    logger.error({ applicationId, err }, "application decision email failed");
  }
}

export function listUserApplications(applicantUserId: string) {
  return getDb().application.findMany({
    where: { userProfile: { userId: applicantUserId } },
    include: {
      opportunity: {
        select: {
          id: true,
          title: true,
          organisationProfile: {
            select: { businessName: true, user: { select: { email: true } } },
          },
          _count: { select: { stages: true } },
        },
      },
      currentStage: { select: { name: true, kind: true } },
      // Status only: students never see the report or scores (docs/PRODUCT.md §3).
      interviewSessions: {
        select: { stageId: true, status: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { appliedAt: "desc" },
  });
}

export function getOwnApplication(applicantUserId: string, opportunityId: string) {
  return getDb().application.findFirst({
    where: { opportunityId, userProfile: { userId: applicantUserId } },
  });
}

export async function getResumeForUser(userId: string, applicationId: string) {
  const application = await getDb().application.findFirst({
    where: {
      id: applicationId,
      OR: [{ userProfile: { userId } }, { opportunity: { organisationProfile: { userId } } }],
    },
    select: { resumeFileName: true, resumeStorageKey: true },
  });
  return application;
}
