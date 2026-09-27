import { Prisma } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { visibleOpportunityWhere } from "./search";
import { appliedRange, parseApplicantFilters, type ApplicantFilters } from "./applicant-filters";
import { cancelFutureEventsForApplication } from "./scheduling";
import type { ResumeExtension } from "./resumes";
import { analyzeApplication } from "./resume-analysis";
import { addResume, deleteStoredFileIfUnreferenced } from "./resume-library";

type TxClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

export const MAX_NOTE_LENGTH = 1000;

const DEFAULT_APPLICANT_FILTERS = parseApplicantFilters({});

export type ApplyFailure =
  | "needs_profile"
  | "not_open"
  | "already_applied"
  | "resume_not_found"
  | "resume_limit"
  | "answers_mismatch";
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

/**
 * Apply to a visible listing with a resume and answers to all of its screening questions
 * (keyed by question ID). A withdrawn application is resubmitted in place, replacing its answers.
 */
export async function applyToOpportunity(
  applicantUserId: string,
  opportunityId: string,
  input: { note: string; answers?: Record<string, string> } & ApplyResume,
): Promise<ApplyResult> {
  const db = getDb();
  const profile = await db.userProfile.findUnique({ where: { userId: applicantUserId } });
  if (!profile) return { ok: false, reason: "needs_profile" };

  const open = await db.opportunity.findFirst({
    where: { id: opportunityId, ...visibleOpportunityWhere() },
    select: { id: true, questions: { select: { id: true } } },
  });
  if (!open) return { ok: false, reason: "not_open" };

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

  let resume: { id: string; fileName: string; storageKey: string };
  if ("resumeId" in input) {
    const found = await db.resume.findFirst({
      where: { id: input.resumeId, userProfileId: profile.id },
      select: { id: true, fileName: true, storageKey: true },
    });
    if (!found) return { ok: false, reason: "resume_not_found" };
    resume = found;
  } else {
    const added = await addResume(applicantUserId, input);
    if (!added.ok)
      return { ok: false, reason: added.reason === "limit" ? "resume_limit" : "needs_profile" };
    resume = added.resume;
  }

  const data = {
    note: noteOrNull(input.note),
    resumeId: resume.id,
    resumeFileName: resume.fileName,
    resumeStorageKey: resume.storageKey,
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
      if (!existing) {
        const created = await tx.application.create({
          data: {
            ...data,
            opportunityId,
            userProfileId: profile.id,
            answers: { create: answerRows },
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

  if (existing && existing.resumeStorageKey !== resume.storageKey) {
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

/**
 * Marks a `submitted` application decided, conditional on `where` (which the caller composes for
 * its own optimistic-concurrency check), inside a transaction it controls. Internal helper shared
 * by `decideApplication` and `pipeline-progress.ts` (ADR-037: pipeline wraps accept/reject), so
 * the decision write and its StageEvent (when any) commit together. Returns the row count updated
 * (0 or 1); callers decide what a miss means (`invalid_state` vs `stale`).
 */
export async function decideApplicationTx(
  tx: TxClient,
  where: Prisma.ApplicationWhereInput,
  decision: "accepted" | "rejected",
): Promise<number> {
  const { count } = await tx.application.updateMany({
    where: { ...where, status: "submitted" },
    data: { status: decision, decidedAt: new Date() },
  });
  return count;
}

/** The acceptance/rejection email, shared by `decideApplication` and `pipeline-progress.ts`. */
export async function notifyApplicationDecision(
  applicationId: string,
  decision: "accepted" | "rejected",
): Promise<void> {
  await notifyUser(applicationId, decision);
}

export async function decideApplication(
  organisationUserId: string,
  applicationId: string,
  decision: "accepted" | "rejected",
): Promise<DecisionResult> {
  const count = await decideApplicationTx(
    getDb(),
    { id: applicationId, opportunity: { organisationProfile: { userId: organisationUserId } } },
    decision,
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

async function notifyUser(applicationId: string, decision: "accepted" | "rejected") {
  const logger = getLogger();
  try {
    const application = await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        opportunity: {
          select: {
            title: true,
            organisationProfile: {
              select: { businessName: true, user: { select: { email: true } } },
            },
          },
        },
        userProfile: { select: { user: { select: { email: true } } } },
      },
    });
    const url = `${getEnv().BETTER_AUTH_URL}/user/applications`;
    const business = application.opportunity.organisationProfile;
    const text =
      decision === "accepted"
        ? `${business.businessName} accepted your application for ${application.opportunity.title}.\n\nContact them at ${business.user.email}.\n\n${url}`
        : `${business.businessName} didn't accept your application for ${application.opportunity.title}.\n\n${url}`;
    await sendEmail({
      to: application.userProfile.user.email,
      subject:
        decision === "accepted"
          ? `Application accepted: ${application.opportunity.title}`
          : `Application update: ${application.opportunity.title}`,
      text,
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
      currentStage: { select: { name: true } },
    },
    orderBy: { appliedAt: "desc" },
  });
}

export function getOwnApplication(applicantUserId: string, opportunityId: string) {
  return getDb().application.findFirst({
    where: { opportunityId, userProfile: { userId: applicantUserId } },
  });
}

/**
 * Applicants for one of the organisation's listings, with scores and answers, filtered and
 * sorted (ADR-033). `unscored` counts applicants hidden only because they have no overall score.
 */
export async function listApplicants(
  organisationUserId: string,
  opportunityId: string,
  filters: ApplicantFilters = DEFAULT_APPLICANT_FILTERS,
  now = new Date(),
) {
  const range = appliedRange(filters, now);
  const base: Prisma.ApplicationWhereInput = {
    opportunityId,
    opportunity: { organisationProfile: { userId: organisationUserId } },
    ...(range ? { appliedAt: range } : {}),
    ...(filters.stage === "applied"
      ? { currentStageId: null }
      : filters.stage
        ? { currentStageId: filters.stage }
        : {}),
  };
  const where: Prisma.ApplicationWhereInput =
    filters.minScore === null
      ? base
      : { ...base, analysis: { is: { overallScore: { gte: filters.minScore } } } };
  const orderBy: Prisma.ApplicationOrderByWithRelationInput[] =
    filters.sort === "score"
      ? [{ analysis: { overallScore: { sort: "desc", nulls: "last" } } }, { appliedAt: "desc" }]
      : [{ appliedAt: filters.sort === "oldest" ? "asc" : "desc" }];

  const db = getDb();
  const [applicants, unscored] = await Promise.all([
    db.application.findMany({
      where,
      orderBy,
      include: {
        userProfile: {
          select: {
            institution: true,
            course: true,
            skills: true,
            user: { select: { name: true, email: true } },
          },
        },
        analysis: true,
        answers: {
          select: {
            id: true,
            answer: true,
            score: true,
            feedback: true,
            question: { select: { prompt: true, position: true } },
          },
          orderBy: { question: { position: "asc" } },
        },
      },
    }),
    filters.minScore === null
      ? Promise.resolve(0)
      : db.application.count({
          where: {
            ...base,
            OR: [{ analysis: { is: null } }, { analysis: { is: { overallScore: null } } }],
          },
        }),
  ]);
  return { applicants, unscored };
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
