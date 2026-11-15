import { Search, Settings2, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/authz";
import {
  BOARD_SORT_LABELS,
  BOARD_SORTS,
  boardHref,
  boardTabs,
  defaultTab,
  parseBoardParams,
} from "@/lib/hiring-board";
import { loadBoard, rowsForTab } from "@/lib/hiring-board-data";
import { getOwnOpportunity } from "@/lib/opportunities";
import { recommendedStepsAction } from "./actions";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "Applicants · Venture Path" };

const EMPTY_TEXT: Record<string, string> = {
  applied: "Nobody new. New applications show up here.",
  offer: "No offers waiting. Offers you make show up here until the student answers.",
  hired: "Nobody hired yet.",
  not_selected: "Nobody here.",
};

/**
 * Hiring board (plan 2026-11-12-hiring-and-ai-interview-v2, Part 1): tabs Applied · each hiring
 * step · Offer · Hired · Not selected, one compact row per candidate with one next-step button.
 * Owner only.
 */
export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("organisation");
  const { id } = await params;
  const [opportunity, board] = await Promise.all([
    getOwnOpportunity(session.user.id, id),
    loadBoard(session.user.id, id),
  ]);
  if (!opportunity || !board) notFound();

  const { stages, counts } = board;
  const query = parseBoardParams(await searchParams, stages);
  const tab = query.tab ?? defaultTab(counts, stages);
  const rows = rowsForTab(board, tab, query.q, query.sort);
  const basePath = `/organisation/opportunities/${id}/applicants`;
  const linkQuery = `?${new URLSearchParams({ tab, sort: query.sort }).toString()}`;
  const hasAiStage = stages.some((stage) => stage.kind === "ai_interview");
  const stageTab = stages.find((stage) => stage.id === tab);
  const selectable = tab === "applied" || Boolean(stageTab);
  const total = board.rows.length;

  return (
    <RoleHome
      title={opportunity.title}
      name={session.user.name}
      back={{ href: "/organisation/opportunities", label: "Your listings" }}
      description={
        total === 0
          ? "No applications yet."
          : `${total} ${total === 1 ? "applicant" : "applicants"} · tick candidates to compare or act on several at once.`
      }
      actions={
        stages.length > 0 ? (
          <Link
            href={`/organisation/opportunities/${id}/edit#hiring-steps`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 data-icon="inline-start" />
            Edit hiring steps
          </Link>
        ) : undefined
      }
    >
      {stages.length === 0 && (
        <section
          aria-label="Add hiring steps"
          className="flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e5e5] bg-[#fafafa] text-[#525252]"
            >
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[#121212]">Add hiring steps</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#737373]">
                Recommended: a short <strong className="text-[#404040]">AI interview</strong> first,
                then a <strong className="text-[#404040]">Live interview</strong> with you. After
                the last step you send an offer. Without steps you can still make an offer straight
                from Applied.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <form action={recommendedStepsAction}>
              <input type="hidden" name="opportunityId" value={id} />
              <Button type="submit" size="sm">
                Use recommended steps
              </Button>
            </form>
            <Link
              href={`/organisation/opportunities/${id}/edit#hiring-steps`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Choose my own steps
            </Link>
          </div>
        </section>
      )}

      <section className="min-w-0 rounded-xl border border-[#e5e5e5] bg-white">
        <nav aria-label="Hiring steps" className="overflow-x-auto border-b border-[#e5e5e5]">
          <ul className="flex w-max gap-1 px-3">
            {boardTabs(stages).map((item) => {
              const active = item.key === tab;
              return (
                <li key={item.key}>
                  <Link
                    href={boardHref(basePath, { tab: item.key, q: query.q, sort: query.sort })}
                    aria-current={active ? "page" : undefined}
                    className={`relative inline-flex h-11 items-center gap-2 px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? "text-[#121212] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#16a34a]"
                        : "text-[#737373] hover:text-[#121212]"
                    }`}
                  >
                    {item.label}
                    <span
                      className={`min-w-5 rounded-md px-1.5 py-px text-center text-[12px] tabular-nums ${
                        active ? "bg-[#121212] text-white" : "bg-[#f5f5f5] text-[#525252]"
                      }`}
                    >
                      {counts[item.key] ?? 0}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-3 py-2.5">
            <form
              method="get"
              action={basePath}
              role="search"
              className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1"
            >
              <input type="hidden" name="tab" value={tab} />
              {query.sort !== "best" && <input type="hidden" name="sort" value={query.sort} />}
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#a3a3a3]"
                />
                <input
                  name="q"
                  type="search"
                  defaultValue={query.q}
                  placeholder="Search by name"
                  aria-label="Search by name"
                  className="h-9 w-full rounded-lg border border-[#e5e5e5] bg-[#fafafa] pr-3 pl-9 text-[14px] outline-none placeholder:text-[#a3a3a3] focus-visible:border-[#121212] focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#121212]/10"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className="h-9">
                Search
              </Button>
            </form>
            <div
              className="inline-flex items-center gap-0.5 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-0.5"
              aria-label="Sort"
            >
              {BOARD_SORTS.map((sort) => {
                const active = sort === query.sort;
                return (
                  <Link
                    key={sort}
                    href={boardHref(basePath, { tab, q: query.q, sort })}
                    aria-current={active ? "true" : undefined}
                    className={`inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-white text-[#121212] shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                        : "text-[#737373] hover:text-[#121212]"
                    }`}
                  >
                    {BOARD_SORT_LABELS[sort]}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {total === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#737373]">No applications yet.</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#737373]" aria-live="polite">
            {query.q
              ? `Nobody called “${query.q}” here.`
              : (EMPTY_TEXT[tab] ?? `Nobody at ${stageTab?.name ?? "this step"} right now.`)}
          </p>
        ) : (
          <BoardList
            rows={rows.map((row) => ({
              id: row.id,
              name: row.name,
              course: row.course,
              institution: row.institution,
              appliedAt: row.appliedAt,
              currentStageId: row.currentStageId,
              offerStatus: row.offerStatus,
              bestProofLevel: row.bestProofLevel,
              screeningScore: row.screeningScore,
              interview: row.interview,
              nextStep: row.nextStep,
            }))}
            basePath={basePath}
            linkQuery={linkQuery}
            opportunityId={id}
            selectable={selectable}
            canSendAiInterview={tab === "applied" && hasAiStage}
          />
        )}
      </section>
    </RoleHome>
  );
}
