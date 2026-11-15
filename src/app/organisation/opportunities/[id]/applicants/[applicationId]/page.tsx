import { ChevronLeft, ChevronRight, Download, Mail } from "lucide-react";
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
  "h-9 min-w-0 flex-1 rounded-lg border border-[#e5e5e5] bg-white px-2.5 text-base md:text-sm";

const OUTCOME_TEXT = { passed: "Passed", failed: "Not selected at", moved: "Moved to" } as const;

/** A titled panel; `aria-label` keeps it a named region for tests and screen readers. */
function Section({
  title,
  description,
  children,
  flush = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** No inner padding (for lists that draw their own rows). */
  flush?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
    >
      <div className="border-b border-[#f0f0f0] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
        {description && <p className="text-[13px] text-[#737373]">{description}</p>}
      </div>
      <div className={flush ? "" : "flex flex-col gap-3 p-5"}>{children}</div>
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

  const navClass = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <RoleHome
      title={name}
      name={session.user.name}
      back={{ href: boardHref(basePath, { tab, sort: query.sort }), label: opportunity.title }}
      description={`${candidate.userProfile.course}, ${candidate.userProfile.institution}`}
      actions={
        around.previous || around.next ? (
          <nav aria-label="Candidates in this step" className="flex gap-2">
            {around.previous ? (
              <Link href={`${basePath}/${around.previous}${linkQuery}`} className={navClass}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Link>
            ) : null}
            {around.next ? (
              <Link href={`${basePath}/${around.next}${linkQuery}`} className={navClass}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Link>
            ) : null}
          </nav>
        ) : undefined
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-label="Application"
            className="flex min-w-0 flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#121212] text-[15px] font-semibold text-white"
              >
                {name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <StagePill label={tabLabel} />
                  {candidate.offerStatus && <OfferChip status={candidate.offerStatus} />}
                  <ScreeningChip score={row.screeningScore} />
                  <InterviewChip interview={row.interview} />
                </div>
                <p className="text-[13px] text-[#737373]">
                  Applied {formatIndiaDateTime(candidate.appliedAt)}
                </p>
              </div>
            </div>

            {/* Contact only once hired (ADR-013 rule kept). */}
            {candidate.status === "accepted" && (
              <p className="flex items-center gap-2 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[14px] text-[#166534]">
                <Mail aria-hidden className="size-4 shrink-0" />
                Email: {candidate.userProfile.user.email}
              </p>
            )}

            {candidate.userProfile.skills.length > 0 && (
              <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
                {candidate.userProfile.skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-md border border-[#e5e5e5] px-2 py-0.5 text-[12px] text-[#404040]"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            )}

            {candidate.note && (
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-semibold tracking-wide text-[#737373] uppercase">
                  Note from the candidate
                </p>
                <p className="text-[14px] leading-relaxed whitespace-pre-line text-[#262626]">
                  {candidate.note}
                </p>
              </div>
            )}

            {candidate.resumeFileName && (
              <a
                href={`/api/applications/${candidate.id}/resume`}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#fafafa]"
              >
                <Download aria-hidden className="size-4 text-[#737373]" />
                Download {candidate.resumeFileName}
              </a>
            )}

            {candidate.offerStatus && candidate.offerMessage && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-4 text-[14px]">
                <p className="font-semibold text-[#121212]">Your offer</p>
                <p className="whitespace-pre-line text-[#404040]">{candidate.offerMessage}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[#525252]">
                  {formatStipend(candidate.offerStipendInr) && (
                    <p>Stipend: {formatStipend(candidate.offerStipendInr)}</p>
                  )}
                  {formatStartDate(candidate.offerStartDate) && (
                    <p>Start date: {formatStartDate(candidate.offerStartDate)}</p>
                  )}
                </div>
              </div>
            )}

            {candidate.status === "rejected" && candidate.notSelectedReason && (
              <p className="text-[13px] text-[#737373]">Note sent: {candidate.notSelectedReason}</p>
            )}
          </section>

          {candidate.proofs.length > 0 && (
            <Section
              title="Proof"
              description={`${candidate.proofs.length} ${candidate.proofs.length === 1 ? "card" : "cards"} attached`}
            >
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
                <ScheduledEventsList
                  events={candidateEvents}
                  interviewerOptions={interviewerOptions}
                />
              )}
              {candidateEvents.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[#f0f0f0] pt-3">
                  <p className="text-[12px] font-semibold tracking-wide text-[#737373] uppercase">
                    Interviewer feedback
                  </p>
                  <FeedbackList items={feedback[applicationId] ?? []} />
                </div>
              )}
            </Section>
          )}

          {candidate.answers.length > 0 && (
            <Section title="Screening answers" flush>
              <ol className="flex flex-col divide-y divide-[#f0f0f0] text-[14px]">
                {candidate.answers.map((answer, index) => (
                  <li key={answer.id} className="flex min-w-0 flex-col gap-1.5 px-5 py-4">
                    <p className="font-medium break-words text-[#121212]">
                      <span className="text-[#a3a3a3] tabular-nums">{index + 1}.</span>{" "}
                      {answer.question.prompt}
                    </p>
                    <p className="leading-relaxed whitespace-pre-line break-words text-[#404040]">
                      {answer.answer}
                    </p>
                    {(answer.score !== null || answer.feedback) && (
                      <p className="text-[12px] text-[#737373]">
                        {answer.score !== null && (
                          <span className="font-medium text-[#525252]">
                            AI score {answer.score}
                          </span>
                        )}
                        {answer.score !== null && answer.feedback && " · "}
                        {answer.feedback}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6">
          <CandidateActionBar
            applicationId={candidate.id}
            currentStageId={candidate.currentStageId}
            nextStep={row.nextStep}
            canMarkNotSelected={submitted && candidate.offerStatus !== "pending"}
            openOffer={rawParams.offer === "1"}
            minStartDate={indiaToday()}
          />

          <Section title="Timeline">
            <ol className="relative flex flex-col gap-3 pl-4 text-[13px] before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-[#e5e5e5]">
              {timeline.map((item, index) => (
                <li key={index} className="relative flex flex-col">
                  <span
                    aria-hidden
                    className={`absolute top-1.5 -left-4 size-[7px] rounded-full ${
                      index === timeline.length - 1 ? "bg-[#16a34a]" : "bg-[#d4d4d4]"
                    }`}
                  />
                  <span className="font-medium text-[#121212]">{item.text}</span>
                  <span className="text-[12px] text-[#737373] tabular-nums">
                    {formatIndiaDateTime(item.at)}
                  </span>
                </li>
              ))}
            </ol>
            {submitted && board.stages.length > 0 && candidate.offerStatus !== "pending" && (
              <details className="border-t border-[#f0f0f0] pt-3 text-sm">
                <summary className="cursor-pointer text-[13px] font-medium text-[#525252] hover:text-[#121212]">
                  Move to a different step
                </summary>
                <form action={moveAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="applicationId" value={candidate.id} />
                  <input
                    type="hidden"
                    name="expectedStageId"
                    value={candidate.currentStageId ?? ""}
                  />
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
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Move
                  </button>
                </form>
              </details>
            )}
          </Section>
        </aside>
      </div>
      {/* Room for the action bar pinned to the bottom on smaller screens. */}
      {row.nextStep.kind !== "none" && <div aria-hidden className="h-16 lg:hidden" />}
    </RoleHome>
  );
}
