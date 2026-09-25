import { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { visibleOpportunityWhere } from "./search";
import { deleteResume, saveResume, type ResumeExtension } from "./resumes";
import { analyzeResume } from "./resume-analysis";

export const MAX_NOTE_LENGTH = 1000;

export type ApplyFailure = "needs_profile" | "not_open" | "already_applied";
export type ApplyResult = { ok: true; id: string } | { ok: false; reason: ApplyFailure };

export type DecisionFailure = "not_found" | "invalid_state";
export type DecisionResult = { ok: true } | { ok: false; reason: DecisionFailure };

const noteOrNull = (note: string) => {
  const trimmed = note.trim();
  return trimmed ? trimmed.slice(0, MAX_NOTE_LENGTH) : null;
};

export async function applyToOpportunity(
  studentUserId: string,
  opportunityId: string,
  input: { note: string; fileName: string; extension: ResumeExtension; bytes: Buffer },
): Promise<ApplyResult> {
  const db = getDb();
  const profile = await db.studentProfile.findUnique({ where: { userId: studentUserId } });
  if (!profile) return { ok: false, reason: "needs_profile" };

  const open = await db.opportunity.findFirst({
    where: { id: opportunityId, ...visibleOpportunityWhere() },
    select: { id: true },
  });
  if (!open) return { ok: false, reason: "not_open" };

  const existing = await db.application.findUnique({
    where: { opportunityId_studentProfileId: { opportunityId, studentProfileId: profile.id } },
  });
  if (existing && existing.status !== "withdrawn") return { ok: false, reason: "already_applied" };

  const storageKey = await saveResume(input.extension, input.bytes);
  const data = {
    note: noteOrNull(input.note),
    resumeFileName: input.fileName,
    resumeStorageKey: storageKey,
    status: "submitted" as const,
    appliedAt: new Date(),
    decidedAt: null,
  };

  try {
    if (!existing) {
      const created = await db.application.create({
        data: { ...data, opportunityId, studentProfileId: profile.id },
        select: { id: true },
      });
      getLogger().info(
        { userId: studentUserId, applicationId: created.id, opportunityId },
        "application submitted",
      );
      void notifyMsme(created.id);
      // Analyze the resume in the background. Never awaited — a failure does not block the flow.
      void analyzeResume(created.id).catch((err: unknown) =>
        getLogger().error({ applicationId: created.id, err }, "resume analysis failed"),
      );
      return { ok: true, id: created.id };
    }

    const { count } = await db.application.updateMany({
      where: { id: existing.id, status: "withdrawn" },
      data,
    });
    if (count === 0) {
      await deleteResume(storageKey);
      return { ok: false, reason: "already_applied" };
    }
    await deleteResume(existing.resumeStorageKey);
    getLogger().info(
      { userId: studentUserId, applicationId: existing.id, opportunityId },
      "application resubmitted",
    );
    void notifyMsme(existing.id);
    void analyzeResume(existing.id).catch((err: unknown) =>
      getLogger().error({ applicationId: existing.id, err }, "resume analysis failed"),
    );
    return { ok: true, id: existing.id };
  } catch (err) {
    await deleteResume(storageKey);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "already_applied" };
    }
    throw err;
  }
}

export async function withdrawApplication(
  studentUserId: string,
  applicationId: string,
): Promise<DecisionResult> {
  const { count } = await getDb().application.updateMany({
    where: { id: applicationId, status: "submitted", studentProfile: { userId: studentUserId } },
    data: { status: "withdrawn" },
  });
  if (count === 0) return { ok: false, reason: "invalid_state" };
  getLogger().info({ userId: studentUserId, applicationId }, "application withdrawn");
  return { ok: true };
}

export async function decideApplication(
  msmeUserId: string,
  applicationId: string,
  decision: "accepted" | "rejected",
): Promise<DecisionResult> {
  const { count } = await getDb().application.updateMany({
    where: {
      id: applicationId,
      status: "submitted",
      opportunity: { msmeProfile: { userId: msmeUserId } },
    },
    data: { status: decision, decidedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "invalid_state" };
  getLogger().info({ userId: msmeUserId, applicationId, status: decision }, "application decided");
  void notifyStudent(applicationId, decision);
  return { ok: true };
}

async function notifyMsme(applicationId: string) {
  const logger = getLogger();
  try {
    const application = await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        opportunity: {
          select: {
            id: true,
            title: true,
            msmeProfile: { select: { user: { select: { email: true } } } },
          },
        },
        studentProfile: { select: { user: { select: { name: true } } } },
      },
    });
    const url = `${getEnv().BETTER_AUTH_URL}/msme/opportunities/${application.opportunity.id}/applicants`;
    await sendEmail({
      to: application.opportunity.msmeProfile.user.email,
      subject: `New application for ${application.opportunity.title}`,
      text: `${application.studentProfile.user.name} applied to ${application.opportunity.title}.\n\nReview applicants:\n${url}`,
    });
    logger.info({ applicationId }, "application email sent");
  } catch (err) {
    logger.error({ applicationId, err }, "application email failed");
  }
}

async function notifyStudent(applicationId: string, decision: "accepted" | "rejected") {
  const logger = getLogger();
  try {
    const application = await getDb().application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        opportunity: {
          select: {
            title: true,
            msmeProfile: { select: { businessName: true, user: { select: { email: true } } } },
          },
        },
        studentProfile: { select: { user: { select: { email: true } } } },
      },
    });
    const url = `${getEnv().BETTER_AUTH_URL}/student/applications`;
    const business = application.opportunity.msmeProfile;
    const text =
      decision === "accepted"
        ? `${business.businessName} accepted your application for ${application.opportunity.title}.\n\nContact them at ${business.user.email}.\n\n${url}`
        : `${business.businessName} didn't accept your application for ${application.opportunity.title}.\n\n${url}`;
    await sendEmail({
      to: application.studentProfile.user.email,
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

export function listStudentApplications(studentUserId: string) {
  return getDb().application.findMany({
    where: { studentProfile: { userId: studentUserId } },
    include: {
      opportunity: {
        select: {
          id: true,
          title: true,
          msmeProfile: { select: { businessName: true, user: { select: { email: true } } } },
        },
      },
    },
    orderBy: { appliedAt: "desc" },
  });
}

export function getOwnApplication(studentUserId: string, opportunityId: string) {
  return getDb().application.findFirst({
    where: { opportunityId, studentProfile: { userId: studentUserId } },
  });
}

export function listApplicants(msmeUserId: string, opportunityId: string) {
  return getDb().application.findMany({
    where: { opportunityId, opportunity: { msmeProfile: { userId: msmeUserId } } },
    include: {
      studentProfile: {
        select: {
          institution: true,
          course: true,
          skills: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { appliedAt: "desc" },
  });
}

/** Fetch all resume analyses for the listings owned by `msmeUserId`. */
export function listApplicantAnalyses(msmeUserId: string, opportunityId: string) {
  return getDb().analysis.findMany({
    where: {
      application: {
        opportunity: { msmeProfile: { userId: msmeUserId } },
        opportunityId,
      },
    },
    select: {
      id: true,
      score: true,
      summary: true,
      matchedSkills: true,
      missingSkills: true,
      model: true,
      createdAt: true,
      applicationId: true,
    },
    orderBy: { score: "desc" },
  });
}

export async function getResumeForUser(userId: string, applicationId: string) {
  const application = await getDb().application.findFirst({
    where: {
      id: applicationId,
      OR: [{ studentProfile: { userId } }, { opportunity: { msmeProfile: { userId } } }],
    },
    select: { resumeFileName: true, resumeStorageKey: true },
  });
  return application;
}
