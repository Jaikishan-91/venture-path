import "server-only";
import { getDb } from "./db";
import { sortByProofLevel } from "./proof-schemas";
import {
  interviewScore,
  MAX_COMPARE,
  MIN_COMPARE,
  type InterviewRecommendation,
  type InterviewReport,
  type ProofLevel,
  type Result,
} from "./v2/types";

/**
 * Compare 2–4 candidates of one listing side by side (plan 2026-11-12-hiring-and-ai-interview-v2,
 * Part 3.4). The listing's owner only: hiring managers and students never see AI scores. Read-only.
 */

export type CompareCandidate = {
  applicationId: string;
  name: string;
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  bestProof: { title: string; level: ProofLevel } | null;
  /** AI screening overall score 0–100 (resume/proof + answers), null when not scored. */
  screeningScore: number | null;
  interview: {
    status: "invited" | "in_progress" | "completed" | "expired";
    mode: "chat" | "voice" | null;
    reportStatus: "pending" | "done" | "failed" | null;
    /** 0–100 (`interviewScore`), null without a finished report. */
    score: number | null;
    recommendation: InterviewRecommendation | null;
  } | null;
  /** Aligned with `CompareView.skills`; null = this candidate has no score for that skill. */
  skillScores: (number | null)[];
  strengths: string[];
  concerns: string[];
};

export type CompareView = {
  opportunity: { id: string; title: string };
  /** Every skill any candidate was scored on, in first-seen order (case-insensitive). */
  skills: string[];
  /** In the order the ids were given. */
  candidates: CompareCandidate[];
};

/** Unique, trimmed ids from `?ids=a,b,c` (string or repeated param). */
export function parseCompareIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export async function getInterviewComparison(
  ownerUserId: string,
  opportunityId: string,
  applicationIds: string[],
): Promise<Result<{ view: CompareView }, "not_found" | "invalid">> {
  const ids = [...new Set(applicationIds)];
  if (ids.length < MIN_COMPARE || ids.length > MAX_COMPARE) {
    return { ok: false, reason: "invalid" };
  }
  const db = getDb();
  const opportunity = await db.opportunity.findFirst({
    where: { id: opportunityId, organisationProfile: { userId: ownerUserId } },
    select: { id: true, title: true },
  });
  if (!opportunity) return { ok: false, reason: "not_found" };

  const applications = await db.application.findMany({
    where: { id: { in: ids }, opportunityId, status: { not: "withdrawn" } },
    select: {
      id: true,
      status: true,
      currentStageId: true,
      userProfile: { select: { user: { select: { name: true } } } },
      proofs: { select: { title: true, level: true, createdAt: true } },
      analysis: { select: { overallScore: true } },
      interviewSessions: {
        select: {
          stageId: true,
          status: true,
          mode: true,
          report: true,
          reportStatus: true,
          recommendation: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  // Every id must be one of this listing's (non-withdrawn) applications.
  if (applications.length !== ids.length) return { ok: false, reason: "not_found" };

  const skills: string[] = [];
  const skillKey = (skill: string) => skill.trim().toLowerCase();
  const prepared = ids.map((id) => {
    const application = applications.find((row) => row.id === id)!;
    // Prefer the newest interview with a finished report, else the newest one.
    const session =
      application.interviewSessions.find((row) => row.reportStatus === "done") ??
      application.interviewSessions[0] ??
      null;
    const report =
      session?.reportStatus === "done" ? (session.report as InterviewReport | null) : null;
    for (const entry of report?.skills ?? []) {
      if (!skills.some((skill) => skillKey(skill) === skillKey(entry.skill))) {
        skills.push(entry.skill);
      }
    }
    return { application, session, report };
  });

  const candidates = prepared.map(({ application, session, report }): CompareCandidate => {
    const best = sortByProofLevel(application.proofs)[0];
    const scores = new Map(
      (report?.skills ?? []).map((entry) => [skillKey(entry.skill), entry.score]),
    );
    const unfinished = session?.status === "invited" || session?.status === "in_progress";
    const leftStage =
      application.status !== "submitted" || application.currentStageId !== session?.stageId;
    return {
      applicationId: application.id,
      name: application.userProfile.user.name,
      status: application.status,
      bestProof: best ? { title: best.title, level: best.level } : null,
      screeningScore: application.analysis?.overallScore ?? null,
      interview: session
        ? {
            // Same lazy expiry as the applicants page.
            status: unfinished && leftStage ? "expired" : session.status,
            mode: session.mode,
            reportStatus: session.reportStatus,
            score: interviewScore(report),
            recommendation: report ? session.recommendation : null,
          }
        : null,
      skillScores: skills.map((skill) => scores.get(skillKey(skill)) ?? null),
      strengths: report?.strengths.slice(0, 3) ?? [],
      concerns: report?.concerns.slice(0, 3) ?? [],
    };
  });

  return { ok: true, view: { opportunity, skills, candidates } };
}
