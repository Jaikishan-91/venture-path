import "server-only";
import { listInterviewsForApplications, type OrgInterviewView } from "./ai-interview";
import { getDb } from "./db";
import {
  boardTabOf,
  countByTab,
  matchesSearch,
  nextStepFor,
  sortCandidates,
  tabKey,
  type BoardSort,
  type BoardStage,
  type NextStep,
  type TabKey,
} from "./hiring-board";
import { getOrderedStages } from "./pipelines";
import { sortByProofLevel } from "./proof-schemas";
import { PROOF_CARD_SELECT } from "./proofs";
import {
  interviewScore,
  type InterviewRecommendation,
  type OfferStatus,
  type ProofLevel,
} from "./v2/types";

/**
 * Database side of the hiring board (plan 2026-11-12-hiring-and-ai-interview-v2, Part 1). Owner
 * only: every query is scoped to the organisation that owns the listing. Never used for students
 * or hiring managers (AI scores are on these rows).
 */

export type BoardInterview = {
  status: OrgInterviewView["status"];
  reportStatus: OrgInterviewView["reportStatus"];
  /** 0–100 from the report's skill scores, null without a finished report. */
  score: number | null;
  recommendation: InterviewRecommendation | null;
};

export type BoardRow = {
  id: string;
  name: string;
  course: string;
  institution: string;
  appliedAt: Date;
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
  currentStageId: string | null;
  offerStatus: OfferStatus | null;
  tab: TabKey;
  bestProofLevel: ProofLevel | null;
  screeningScore: number | null;
  interview: BoardInterview | null;
  interviewScore: number | null;
  nextStep: NextStep;
};

export type Board = {
  stages: BoardStage[];
  counts: Record<TabKey, number>;
  rows: BoardRow[];
};

function toBoardInterview(interview: OrgInterviewView | undefined): BoardInterview | null {
  if (!interview) return null;
  return {
    status: interview.status,
    reportStatus: interview.reportStatus,
    score: interviewScore(interview.report),
    recommendation: interview.recommendation,
  };
}

/** Every non-withdrawn candidate of the owner's listing, placed on a tab, or null if not theirs. */
export async function loadBoard(ownerUserId: string, opportunityId: string): Promise<Board | null> {
  const db = getDb();
  const owned = await db.opportunity.count({
    where: { id: opportunityId, organisationProfile: { userId: ownerUserId } },
  });
  if (owned === 0) return null;
  const [stageRows, applications] = await Promise.all([
    getOrderedStages(opportunityId),
    db.application.findMany({
      where: {
        opportunityId,
        status: { not: "withdrawn" },
        opportunity: { organisationProfile: { userId: ownerUserId } },
      },
      select: {
        id: true,
        appliedAt: true,
        status: true,
        currentStageId: true,
        offerStatus: true,
        userProfile: {
          select: { course: true, institution: true, user: { select: { name: true } } },
        },
        analysis: { select: { overallScore: true } },
        proofs: { select: { level: true, createdAt: true } },
      },
    }),
  ]);
  const stages: BoardStage[] = stageRows.map((stage) => ({
    id: stage.id,
    name: stage.name,
    kind: stage.kind,
    durationMinutes: stage.durationMinutes,
  }));
  const interviews = await listInterviewsForApplications(
    ownerUserId,
    applications.map((application) => application.id),
  );

  const rows: BoardRow[] = [];
  for (const application of applications) {
    const tab = boardTabOf(application, stages);
    if (!tab) continue;
    const interview = toBoardInterview(interviews.get(application.id)?.[0]);
    rows.push({
      id: application.id,
      name: application.userProfile.user.name,
      course: application.userProfile.course,
      institution: application.userProfile.institution,
      appliedAt: application.appliedAt,
      status: application.status,
      currentStageId: application.currentStageId,
      offerStatus: application.offerStatus,
      tab: tabKey(tab),
      bestProofLevel: sortByProofLevel(application.proofs)[0]?.level ?? null,
      screeningScore: application.analysis?.overallScore ?? null,
      interview,
      interviewScore: interview?.score ?? null,
      nextStep: nextStepFor(application, stages),
    });
  }
  return { stages, counts: countByTab(applications, stages), rows };
}

/** One tab's rows, searched by name and sorted. */
export function rowsForTab(board: Board, tab: TabKey, q: string, sort: BoardSort): BoardRow[] {
  return sortCandidates(
    board.rows.filter((row) => row.tab === tab && matchesSearch(row.name, q)),
    sort,
  );
}

/** Everything the candidate page shows, for the owner of the listing only. */
export async function loadCandidate(
  ownerUserId: string,
  opportunityId: string,
  applicationId: string,
) {
  const application = await getDb().application.findFirst({
    where: {
      id: applicationId,
      opportunityId,
      status: { not: "withdrawn" },
      opportunity: { organisationProfile: { userId: ownerUserId } },
    },
    select: {
      id: true,
      status: true,
      appliedAt: true,
      decidedAt: true,
      currentStageId: true,
      note: true,
      resumeFileName: true,
      offerStatus: true,
      offerMessage: true,
      offerStipendInr: true,
      offerStartDate: true,
      offeredAt: true,
      offerRespondedAt: true,
      notSelectedReason: true,
      userProfile: {
        select: {
          course: true,
          institution: true,
          skills: true,
          user: { select: { name: true, email: true } },
        },
      },
      analysis: true,
      proofs: { select: PROOF_CARD_SELECT },
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
      stageEvents: {
        select: {
          id: true,
          outcome: true,
          note: true,
          createdAt: true,
          stage: { select: { name: true } },
          actor: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!application) return null;
  return { ...application, proofs: sortByProofLevel(application.proofs) };
}

export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof loadCandidate>>>;
