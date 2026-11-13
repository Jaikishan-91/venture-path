import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FeedbackList } from "@/components/hiring/feedback-list";
import {
  InterviewChip,
  OfferChip,
  ScreeningChip,
  StagePill,
} from "@/components/hiring/candidate-chips";
import { ProofCard } from "@/components/proof/proof-card";
import { RoleHome } from "@/components/role-home";
import { buttonVariants } from "@/components/ui/button";
import { listInterviewsForApplications } from "@/lib/ai-interview";
import { requireRole } from "@/lib/authz";
import { boardHref, boardTabs, neighbours, parseBoardParams } from "@/lib/hiring-board";
import { loadBoard, loadCandidate, rowsForTab } from "@/lib/hiring-board-data";
import { formatIndiaDateTime } from "@/lib/hiring/time";
import { DEFAULT_DURATION_MINUTES, type StageKind } from "@/lib/hiring/types";
import { listFeedbackForApplications } from "@/lib/interview-feedback";
import { createLlmClient } from "@/lib/llm/provider";
import { formatStartDate, formatStipend, indiaToday } from "@/lib/offer-schemas";
import { OFFER_ACCEPTED_NOTE } from "@/lib/offer-schemas";
import { getOwnOpportunity } from "@/lib/opportunities";
import { listEventsForApplications } from "@/lib/scheduling";
import { listInterviewerOptions } from "@/lib/team";
import { moveAction } from "../actions";
import { AiInterviewSection } from "../ai-interview-section";
import { ResumeAnalysis } from "../resume-analysis";
import { ScheduleForm } from "../schedule-form";
import { ScheduledEventsList } from "../scheduled-events-list";
import { CandidateActionBar } from "./candidate-actions";

export const metadata: Metadata = { title: "Candidate · Venture Path" };

/** Stage kinds whose step is a live session the owner schedules (Google Meet for interviews). */
const LIVE_KINDS: readonly StageKind[] = ["interview", "test", "assignment"];

const selectClass =
  "h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-base md:text-sm";

const OUTCOME_TEXT = { passed: "Passed", failed: "Not selected at", moved: "Moved to" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[#737373]">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Candidate page (plan 2026-11-12-hiring-and-ai-interview-v2, Part 1.3): everything about one
 * candidate, in one place, with one action bar. Owner only.
 */
export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; applicationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("organisation");
  const { id, applicationId } = await params;
  const ownerId = session.user.id;
  const [opportunity, board, candidate] = await Promise.all([
    getOwnOpportunity(ownerId, id),
    loadBoard(ownerId, id),
    loadCandidate(ownerId, id, applicationId),
  ]);
  if (!opportunity || !board || !candidate) notFound();

  const rawParams = await searchParams;
  const query = parseBoardParams(rawParams, board.stages);
  const row = board.rows.find((item) => item.id === applicationId);
  if (!row) notFound();
  const tab = query.tab ?? row.tab;
  const tabLabel = boardTabs(board.stages).find((item) => item.key === row.tab)?.label ?? "Applied";
  const ids = rowsForTab(board, tab, "", query.sort).map((item) => item.id);
  const around = neighbours(ids, applicationId);
  const basePath = `/organisation/opportunities/${id}/applicants`;
  const linkQuery = `?${new URLSearchParams({ tab, sort: query.sort }).toString()}`;

  const [interviews, events, feedback, interviewerOptions] = await Promise.all([
    listInterviewsForApplications(ownerId, [applicationId]),
    listEventsForApplications(ownerId, [applicationId]),
    listFeedbackForApplications(ownerId, [applicationId]),
    listInterviewerOptions(ownerId),
  ]);
  const interview = interviews.get(applicationId)?.[0];
  const candidateEvents = events.get(applicationId) ?? [];
  const currentStage = board.stages.find((stage) => stage.id === candidate.currentStageId);
  const atLiveStage =
    candidate.status === "submitted" &&
    currentStage !== undefined &&
    LIVE_KINDS.includes(currentStage.kind);
  const submitted = candidate.status === "submitted";
  const canReanalyze = createLlmClient() !== null;
  const name = candidate.userProfile.user.name;

  const timeline: { at: Date; text: string }[] = [
    { at: candidate.appliedAt, text: "Applied" },
    // The "passed" event written when the student accepts is shown as the offer answer below.
    ...candidate.stageEvents
      .filter((event) => event.note !== OFFER_ACCEPTED_NOTE)
      .map((event) => ({
        at: event.createdAt,
        text: `${OUTCOME_TEXT[event.outcome]} ${event.stage.name}${event.actor ? ` · ${event.actor.name}` : ""}`,
      })),
    ...(candidate.offeredAt ? [{ at: candidate.offeredAt, text: "Offer sent" }] : []),
    ...(candidate.offerRespondedAt && candidate.offerStatus
      ? [
          {
            at: candidate.offerRespondedAt,
            text:
              candidate.offerStatus === "declined" ? "Offer declined" : "Offer accepted · Hired",
          },
        ]
      : []),
    ...(candidate.status === "rejected" && candidate.decidedAt
      ? [{ at: candidate.decidedAt, text: "Not selected" }]
      : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <RoleHome title={name} name={session.user.name}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={boardHref(basePath, { tab, sort: query.sort })} className="underline">
          ← {opportunity.title}
        </Link>
        <div className="flex gap-2">
          {around.previous ? (
            <Link
              href={`${basePath}/${around.previous}${linkQuery}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ← Previous
            </Link>
          ) : null}
          {around.next ? (
            <Link
              href={`${basePath}/${around.next}${linkQuery}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next →
            </Link>
          ) : null}
        </div>
      </div>

      <header className="flex flex-col gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <p className="text-sm text-[#737373]">
          {candidate.userProfile.course}, {candidate.userProfile.institution}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <StagePill label={tabLabel} />
          {candidate.offerStatus && <OfferChip status={candidate.offerStatus} />}
          <ScreeningChip score={row.screeningScore} />
          <InterviewChip interview={row.interview} />
        </div>
        <p className="text-sm text-[#737373]">Applied {formatIndiaDateTime(candidate.appliedAt)}</p>
        {/* Contact only once hired (ADR-013 rule kept). */}
        {candidate.status === "accepted" && (
          <p className="text-sm">Email: {candidate.userProfile.user.email}</p>
        )}
        {candidate.userProfile.skills.length > 0 && (
          <p className="text-sm">{candidate.userProfile.skills.join(", ")}</p>
        )}
        {candidate.note && <p className="text-sm whitespace-pre-line">{candidate.note}</p>}
        {candidate.resumeFileName && (
          <a href={`/api/applications/${candidate.id}/resume`} className="w-fit text-sm underline">
            Download {candidate.resumeFileName}
          </a>
        )}
        {candidate.offerStatus && candidate.offerMessage && (
          <div className="flex flex-col gap-1 rounded-lg bg-[#f5f5f5] p-3 text-sm">
            <p className="font-medium">Your offer</p>
            <p className="whitespace-pre-line">{candidate.offerMessage}</p>
            {formatStipend(candidate.offerStipendInr) && (
              <p>Stipend: {formatStipend(candidate.offerStipendInr)}</p>
            )}
            {formatStartDate(candidate.offerStartDate) && (
              <p>Start date: {formatStartDate(candidate.offerStartDate)}</p>
            )}
          </div>
        )}
        {candidate.status === "rejected" && candidate.notSelectedReason && (
          <p className="text-sm text-[#737373]">Note sent: {candidate.notSelectedReason}</p>
        )}
      </header>

      {candidate.proofs.length > 0 && (
        <Section title="Proof">
          {candidate.proofs.map((proof) => (
            <ProofCard key={proof.id} proof={proof} compact />
          ))}
        </Section>
      )}

      {/* The report panel has its own heading. */}
      {interview && <AiInterviewSection interview={interview} />}

      <ResumeAnalysis
        applicationId={candidate.id}
        analysis={candidate.analysis}
        answers={candidate.answers}
        canReanalyze={canReanalyze}
        proofOnly={!candidate.resumeFileName}
        showAnswers={false}
      />

      {(atLiveStage || candidateEvents.length > 0) && (
        <Section title="Live interview">
          {atLiveStage && currentStage && (
            <ScheduleForm
              applicationId={candidate.id}
              stageId={currentStage.id}
              defaultDuration={currentStage.durationMinutes ?? DEFAULT_DURATION_MINUTES}
              interviewerOptions={interviewerOptions}
            />
          )}
          {candidateEvents.length > 0 && (
            <ScheduledEventsList events={candidateEvents} interviewerOptions={interviewerOptions} />
          )}
          {candidateEvents.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Interviewer feedback</p>
              <FeedbackList items={feedback[applicationId] ?? []} />
            </div>
          )}
        </Section>
      )}

      {candidate.answers.length > 0 && (
        <Section title="Screening answers">
          <ol className="flex flex-col gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm">
            {candidate.answers.map((answer, index) => (
              <li key={answer.id} className="flex min-w-0 flex-col gap-1">
                <p className="font-medium break-words">
                  {index + 1}. {answer.question.prompt}
                </p>
                <p className="whitespace-pre-line break-words">{answer.answer}</p>
                {(answer.score !== null || answer.feedback) && (
                  <p className="text-xs text-[#737373]">
                    {answer.score !== null && `AI score ${answer.score}`}
                    {answer.score !== null && answer.feedback && " · "}
                    {answer.feedback}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section title="Timeline">
        <ol className="flex flex-col gap-1.5 rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm">
          {timeline.map((item, index) => (
            <li key={index} className="flex flex-wrap gap-x-2">
              <span className="text-[#737373] tabular-nums">{formatIndiaDateTime(item.at)}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
        {submitted && board.stages.length > 0 && candidate.offerStatus !== "pending" && (
          <details className="text-sm">
            <summary className="cursor-pointer text-[#737373] underline">
              Move to a different step
            </summary>
            <form action={moveAction} className="mt-2 flex max-w-md gap-2">
              <input type="hidden" name="applicationId" value={candidate.id} />
              <input type="hidden" name="expectedStageId" value={candidate.currentStageId ?? ""} />
              <select
                name="targetStageId"
                defaultValue=""
                className={selectClass}
                aria-label="Move to step"
              >
                <option value="" disabled>
                  Choose a step…
                </option>
                <option value="applied">Applied</option>
                {board.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Move
              </button>
            </form>
          </details>
        )}
      </Section>

      <CandidateActionBar
        applicationId={candidate.id}
        currentStageId={candidate.currentStageId}
        nextStep={row.nextStep}
        canMarkNotSelected={submitted && candidate.offerStatus !== "pending"}
        openOffer={rawParams.offer === "1"}
        minStartDate={indiaToday()}
      />
    </RoleHome>
  );
}
