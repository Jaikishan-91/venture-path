import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleHome } from "@/components/role-home";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const metadata: Metadata = { title: "Applicants · VenturePath" };

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
    <RoleHome title={opportunity.title} name={session.user.name}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/organisation/opportunities" className="underline">
          Your listings
        </Link>
        {stages.length > 0 && (
          <Link href={`/organisation/opportunities/${id}/edit#hiring-steps`} className="underline">
            Edit hiring steps
          </Link>
        )}
      </div>

      {stages.length === 0 && (
        <section
          aria-label="Add hiring steps"
          className="flex flex-col gap-3 rounded-xl border border-[#ecedef] bg-white p-4"
        >
          <h2 className="text-base font-medium">Add hiring steps</h2>
          <p className="text-sm text-[#4a4d53]">
            Recommended: a short <strong>AI interview</strong> first, then a{" "}
            <strong>Live interview</strong> with you. After the last step you send an offer. Without
            steps you can still make an offer straight from Applied.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <form action={recommendedStepsAction}>
              <input type="hidden" name="opportunityId" value={id} />
              <Button type="submit" size="sm">
                Use recommended steps
              </Button>
            </form>
            <Link
              href={`/organisation/opportunities/${id}/edit#hiring-steps`}
              className="text-sm underline"
            >
              Choose my own steps
            </Link>
          </div>
        </section>
      )}

      <nav aria-label="Hiring steps" className="-mx-1 overflow-x-auto pb-1">
        <ul className="flex w-max gap-1.5 px-1">
          {boardTabs(stages).map((item) => {
            const active = item.key === tab;
            return (
              <li key={item.key}>
                <Link
                  href={boardHref(basePath, { tab: item.key, q: query.q, sort: query.sort })}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                    active
                      ? "bg-[#26594a] text-white"
                      : "border border-[#ecedef] bg-white text-[#33363b] hover:border-[#c9ccd2]"
                  }`}
                >
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-[#f1f2f4]"}`}
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
        <div className="flex flex-wrap items-center gap-2">
          <form
            method="get"
            action={basePath}
            role="search"
            className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1"
          >
            <input type="hidden" name="tab" value={tab} />
            {query.sort !== "best" && <input type="hidden" name="sort" value={query.sort} />}
            <Input
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Search by name"
              aria-label="Search by name"
              className="min-w-0 flex-1"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
          <div className="flex items-center gap-1 text-sm" aria-label="Sort">
            {BOARD_SORTS.map((sort) => (
              <Link
                key={sort}
                href={boardHref(basePath, { tab, q: query.q, sort })}
                aria-current={sort === query.sort ? "true" : undefined}
                className={buttonVariants({
                  size: "sm",
                  variant: sort === query.sort ? "secondary" : "ghost",
                })}
              >
                {BOARD_SORT_LABELS[sort]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
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
    </RoleHome>
  );
}
