import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import {
  boardHref,
  boardTabOf,
  boardTabs,
  countByTab,
  defaultTab,
  neighbours,
  nextStepFor,
  nextStepLabel,
  parseBoardParams,
  sortCandidates,
  type BoardPlacement,
  type BoardStage,
} from "@/lib/hiring-board";
import { createOpportunity } from "@/lib/opportunities";
import type { OpportunityInput } from "@/lib/opportunity-schemas";
import { applyRecommendedStages, getOrderedStages } from "@/lib/pipelines";
import { studentStatus } from "@/lib/student-application-status";

const ai: BoardStage = { id: "s-ai", name: "AI interview", kind: "ai_interview" };
const live: BoardStage = { id: "s-live", name: "Live interview", kind: "interview" };
const stages = [ai, live];

const at = (overrides: Partial<BoardPlacement> = {}): BoardPlacement => ({
  status: "submitted",
  currentStageId: null,
  offerStatus: null,
  ...overrides,
});

describe("board tabs", () => {
  it("places candidates per the BoardTab contract", () => {
    expect(boardTabOf(at(), stages)).toBe("applied");
    expect(boardTabOf(at({ currentStageId: ai.id }), stages)).toEqual({ stageId: ai.id });
    expect(boardTabOf(at({ currentStageId: live.id, offerStatus: "pending" }), stages)).toBe(
      "offer",
    );
    expect(boardTabOf(at({ currentStageId: live.id, offerStatus: "declined" }), stages)).toBe(
      "offer",
    );
    // A withdrawn offer goes back to the stage.
    expect(boardTabOf(at({ currentStageId: live.id, offerStatus: "withdrawn" }), stages)).toEqual({
      stageId: live.id,
    });
    expect(boardTabOf(at({ status: "accepted", offerStatus: "accepted" }), stages)).toBe("hired");
    expect(boardTabOf(at({ status: "rejected", currentStageId: ai.id }), stages)).toBe(
      "not_selected",
    );
    expect(boardTabOf(at({ status: "withdrawn" }), stages)).toBeNull();
    // A stage that no longer exists falls back to Applied.
    expect(boardTabOf(at({ currentStageId: "gone" }), stages)).toBe("applied");
  });

  it("lists tabs in order, counts them and defaults to the earliest non-empty one", () => {
    expect(boardTabs(stages).map((tab) => tab.label)).toEqual([
      "Applied",
      "AI interview",
      "Live interview",
      "Offer",
      "Hired",
      "Not selected",
    ]);
    const counts = countByTab(
      [
        at({ currentStageId: live.id }),
        at({ currentStageId: live.id }),
        at({ status: "rejected" }),
        at({ status: "withdrawn" }),
      ],
      stages,
    );
    expect(counts).toEqual({
      applied: 0,
      [ai.id]: 0,
      [live.id]: 2,
      offer: 0,
      hired: 0,
      not_selected: 1,
    });
    expect(defaultTab(counts, stages)).toBe(live.id);
    expect(defaultTab(countByTab([], stages), stages)).toBe("applied");
  });

  it("parses params safely and builds links", () => {
    expect(parseBoardParams({ tab: live.id, q: "  Priya ", sort: "newest" }, stages)).toEqual({
      tab: live.id,
      q: "Priya",
      sort: "newest",
    });
    expect(parseBoardParams({ tab: "nope", sort: "weird" }, stages)).toEqual({
      tab: null,
      q: "",
      sort: "best",
    });
    expect(parseBoardParams({ q: "x".repeat(500) }, stages).q).toHaveLength(100);
    expect(boardHref("/b", { tab: "offer", sort: "best" })).toBe("/b?tab=offer");
    expect(boardHref("/b", { tab: "applied", q: "a b", sort: "newest" })).toBe(
      "/b?tab=applied&q=a+b&sort=newest",
    );
  });
});

describe("next step", () => {
  it("is one action that fits the tab", () => {
    expect(nextStepFor(at(), stages)).toEqual({ kind: "send_ai_interview", stage: ai });
    expect(nextStepFor(at({ currentStageId: ai.id }), stages)).toEqual({
      kind: "move",
      stage: live,
    });
    expect(nextStepFor(at({ currentStageId: live.id }), stages)).toEqual({ kind: "make_offer" });
    expect(nextStepFor(at(), [])).toEqual({ kind: "make_offer" });
    expect(nextStepFor(at({ currentStageId: live.id, offerStatus: "pending" }), stages)).toEqual({
      kind: "offer_pending",
    });
    expect(nextStepFor(at({ offerStatus: "declined" }), [])).toEqual({ kind: "offer_declined" });
    expect(nextStepFor(at({ status: "accepted" }), stages)).toEqual({ kind: "none" });
    expect(nextStepLabel({ kind: "move", stage: live })).toBe("Move to Live interview");
    expect(nextStepLabel({ kind: "send_ai_interview", stage: ai })).toBe("Send AI interview");
    expect(nextStepLabel({ kind: "make_offer" })).toBe("Make offer");
    expect(nextStepLabel({ kind: "none" })).toBeNull();
  });
});

describe("sorting", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, n));
  const rows = [
    { name: "A", appliedAt: day(1), interviewScore: null, screeningScore: 90 },
    { name: "B", appliedAt: day(2), interviewScore: 70, screeningScore: 40 },
    { name: "C", appliedAt: day(3), interviewScore: 85, screeningScore: null },
    { name: "D", appliedAt: day(4), interviewScore: null, screeningScore: null },
    { name: "E", appliedAt: day(5), interviewScore: null, screeningScore: 90 },
  ];

  it("best match: interview score, then screening, then newest; newest by date", () => {
    expect(sortCandidates(rows, "best").map((row) => row.name)).toEqual(["C", "B", "E", "A", "D"]);
    expect(sortCandidates(rows, "newest").map((row) => row.name)).toEqual([
      "E",
      "D",
      "C",
      "B",
      "A",
    ]);
    expect(rows.map((row) => row.name)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("finds previous and next candidates", () => {
    expect(neighbours(["a", "b", "c"], "b")).toEqual({ previous: "a", next: "c" });
    expect(neighbours(["a", "b", "c"], "a")).toEqual({ previous: null, next: "b" });
    expect(neighbours(["a"], "z")).toEqual({ previous: null, next: null });
  });
});

describe("student status (My Applications)", () => {
  it("shows a plain status without scores", () => {
    const base = {
      status: "submitted" as const,
      offerStatus: null,
      currentStage: null,
      currentStageId: null,
      interview: null,
    };
    expect(studentStatus(base).label).toBe("Applied");
    expect(
      studentStatus({
        ...base,
        currentStageId: "s1",
        currentStage: { name: "AI interview", kind: "ai_interview" },
        interview: { stageId: "s1", status: "completed" },
      }),
    ).toEqual({ kind: "ai_interview", label: "AI interview", interview: "completed" });
    expect(studentStatus({ ...base, offerStatus: "pending" }).kind).toBe("offer");
    expect(studentStatus({ ...base, status: "accepted", offerStatus: "accepted" }).label).toBe(
      "Hired",
    );
    expect(studentStatus({ ...base, status: "rejected" }).label).toBe("Not selected");
  });
});

// ---------------------------------------------------------------------------------------------
// "Use recommended steps" (D3). Integration: needs the Docker Postgres.
// ---------------------------------------------------------------------------------------------

const EMAIL_DOMAIN = "hiring-board-test.venturepath.local";

afterAll(async () => {
  await getDb().user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await getDb().$disconnect();
});

const listing: OpportunityInput = {
  type: "internship",
  title: "Recommended steps intern",
  description: "Help.",
  skills: [],
  workMode: "remote",
  city: null,
  payType: "unpaid",
  payAmount: null,
  payPeriod: null,
  duration: null,
  deadline: null,
  requirements: null,
  experienceLevel: null,
  compensationMin: null,
  compensationMax: null,
};

async function ownerWithListing(status: "approved" | "pending" = "approved") {
  const owner = await getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Board owner",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName: "Board Co",
          description: "Shop",
          industry: "Retail",
          location: "Pune",
          status: "approved",
        },
      },
    },
  });
  const created = await createOpportunity(owner.id, listing);
  if (!created.ok) throw new Error(created.reason);
  if (status === "pending") {
    await getDb().organisationProfile.update({ where: { userId: owner.id }, data: { status } });
  }
  return { owner, opportunityId: created.id };
}

describe("applyRecommendedStages", () => {
  it("adds AI interview → Live interview once, only when the listing has no steps", async () => {
    const { owner, opportunityId } = await ownerWithListing();
    const first = await applyRecommendedStages(owner.id, opportunityId);
    expect(first.ok).toBe(true);
    const saved = await getOrderedStages(opportunityId);
    expect(saved.map((stage) => [stage.name, stage.kind, stage.durationMinutes])).toEqual([
      ["AI interview", "ai_interview", null],
      ["Live interview", "interview", 30],
    ]);
    expect(
      (await getDb().pipelineStage.findMany({ where: { opportunityId } })).every(
        (stage) => stage.source === "organisation",
      ),
    ).toBe(true);
    expect(await applyRecommendedStages(owner.id, opportunityId)).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(await getOrderedStages(opportunityId)).toHaveLength(2);
  });

  it("is safe against a double click and scoped to the owner", async () => {
    const { owner, opportunityId } = await ownerWithListing();
    const other = await ownerWithListing();
    expect(await applyRecommendedStages(other.owner.id, opportunityId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    const results = await Promise.all([
      applyRecommendedStages(owner.id, opportunityId),
      applyRecommendedStages(owner.id, opportunityId),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await getOrderedStages(opportunityId)).toHaveLength(2);
  });

  it("needs an approved business", async () => {
    const { owner, opportunityId } = await ownerWithListing("pending");
    expect(await applyRecommendedStages(owner.id, opportunityId)).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });
});
