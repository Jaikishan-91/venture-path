import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { getInterviewComparison, parseCompareIds } from "@/lib/interview-compare";
import type { InterviewReport } from "@/lib/v2/types";

// Integration tests: need the Docker Postgres from docker-compose.yml (shared; unique data only).
const EMAIL_DOMAIN = "interview-compare-test.venturepath.local";

async function createOwner(businessName = "Compare Shop") {
  return getDb().user.create({
    data: {
      id: randomUUID(),
      name: "Owner",
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "organisation",
      organisationProfile: {
        create: {
          businessName,
          description: "Sweets",
          industry: "Food",
          location: "Pune",
          status: "approved",
        },
      },
    },
    include: { organisationProfile: true },
  });
}

async function createListing(owner: Awaited<ReturnType<typeof createOwner>>) {
  const db = getDb();
  const opportunity = await db.opportunity.create({
    data: {
      organisationProfileId: owner.organisationProfile!.id,
      type: "internship",
      title: "Social media intern",
      description: "Posts",
      skills: ["Content writing"],
      workMode: "remote",
      payType: "paid",
      status: "published",
    },
  });
  const stage = await db.pipelineStage.create({
    data: {
      opportunityId: opportunity.id,
      position: 0,
      name: "AI interview",
      kind: "ai_interview",
      source: "organisation",
    },
  });
  return { opportunity, stage };
}

async function createCandidate(
  listing: Awaited<ReturnType<typeof createListing>>,
  name: string,
  options: {
    report?: InterviewReport;
    recommendation?: "strong" | "maybe" | "not_fit";
    proofs?: { title: string; level: "added" | "checked" | "verified" }[];
    screening?: number;
    status?: "submitted" | "withdrawn";
  } = {},
) {
  const db = getDb();
  const student = await db.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@${EMAIL_DOMAIN}`,
      role: "user",
      userProfile: {
        create: { institution: "IIT", course: "CSE", graduationYear: 2027, skills: [] },
      },
    },
    include: { userProfile: true },
  });
  const proofs = [];
  for (const proof of options.proofs ?? []) {
    proofs.push(
      await db.proof.create({
        data: {
          userProfileId: student.userProfile!.id,
          title: proof.title,
          whatIDid: "Did it",
          level: proof.level,
        },
      }),
    );
  }
  const application = await db.application.create({
    data: {
      opportunityId: listing.opportunity.id,
      userProfileId: student.userProfile!.id,
      currentStageId: listing.stage.id,
      status: options.status ?? "submitted",
      proofs: { connect: proofs.map((proof) => ({ id: proof.id })) },
      ...(options.screening !== undefined
        ? { analysis: { create: { overallScore: options.screening } } }
        : {}),
    },
  });
  if (options.report) {
    await db.interviewSession.create({
      data: {
        applicationId: application.id,
        stageId: listing.stage.id,
        tokenHash: randomUUID(),
        status: "completed",
        mode: "voice",
        expiresAt: new Date(Date.now() + 86_400_000),
        questions: [],
        completedAt: new Date(),
        report: options.report,
        reportStatus: "done",
        recommendation: options.recommendation ?? "maybe",
      },
    });
  }
  return application;
}

const report = (skills: [string, number][], strengths: string[] = []): InterviewReport => ({
  skills: skills.map(([skill, score]) => ({ skill, score, quote: "" })),
  strengths,
  concerns: ["Check availability"],
  summary: "",
});

afterAll(async () => {
  const db = getDb();
  await db.interviewSession.deleteMany({
    where: { application: { userProfile: { user: { email: { endsWith: `@${EMAIL_DOMAIN}` } } } } },
  });
  await db.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  await db.$disconnect();
});

describe("parseCompareIds", () => {
  it("splits, trims and de-duplicates", () => {
    expect(parseCompareIds(" a, b,,a ,c")).toEqual(["a", "b", "c"]);
    expect(parseCompareIds(["a,b", "c"])).toEqual(["a", "b", "c"]);
    expect(parseCompareIds(undefined)).toEqual([]);
  });
});

describe("getInterviewComparison", () => {
  it("aligns skills by name and shows scores, proof and screening side by side", async () => {
    const owner = await createOwner();
    const listing = await createListing(owner);
    const asha = await createCandidate(listing, "Asha Rao", {
      report: report(
        [
          ["Content writing", 4],
          ["Motivation", 3],
        ],
        ["Real posts"],
      ),
      recommendation: "strong",
      proofs: [
        { title: "Blog", level: "added" },
        { title: "Challenge win", level: "verified" },
      ],
      screening: 81,
    });
    const ravi = await createCandidate(listing, "Ravi K", {
      report: report([
        ["content WRITING", 2],
        ["SEO", 5],
      ]),
      recommendation: "maybe",
    });
    const meena = await createCandidate(listing, "Meena S");

    const result = await getInterviewComparison(owner.id, listing.opportunity.id, [
      ravi.id,
      asha.id,
      meena.id,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { view } = result;
    expect(view.opportunity.title).toBe("Social media intern");
    // First-seen order; "Content writing" and "content WRITING" are one skill.
    expect(view.skills).toEqual(["content WRITING", "SEO", "Motivation"]);
    expect(view.candidates.map((candidate) => candidate.name)).toEqual([
      "Ravi K",
      "Asha Rao",
      "Meena S",
    ]);
    const [r, a, m] = view.candidates;
    expect(r.skillScores).toEqual([2, 5, null]);
    expect(a.skillScores).toEqual([4, null, 3]);
    expect(m.skillScores).toEqual([null, null, null]);
    expect(a).toMatchObject({
      bestProof: { title: "Challenge win", level: "verified" },
      screeningScore: 81,
      interview: { status: "completed", mode: "voice", score: 70, recommendation: "strong" },
      strengths: ["Real posts"],
      concerns: ["Check availability"],
    });
    expect(r.interview).toMatchObject({ score: 70, recommendation: "maybe" });
    expect(m).toMatchObject({ bestProof: null, screeningScore: null, interview: null });
  });

  it("takes 2–4 candidates of the owner's own listing only", async () => {
    const owner = await createOwner();
    const listing = await createListing(owner);
    const ids = [];
    for (const name of ["A", "B", "C", "D", "E"]) {
      ids.push((await createCandidate(listing, name)).id);
    }
    const compare = (
      userId: string,
      applicationIds: string[],
      opportunityId = listing.opportunity.id,
    ) => getInterviewComparison(userId, opportunityId, applicationIds);

    expect(await compare(owner.id, ids.slice(0, 1))).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await compare(owner.id, [ids[0], ids[0]])).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await compare(owner.id, ids)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await compare(owner.id, ids.slice(0, 4))).toMatchObject({ ok: true });

    // Another business (or a hiring manager / student id) can't see them.
    const stranger = await createOwner("Other Shop");
    expect(await compare(stranger.id, ids.slice(0, 2))).toMatchObject({
      ok: false,
      reason: "not_found",
    });

    // Applications of another listing, or withdrawn ones, are not part of this comparison.
    const otherListing = await createListing(owner);
    const elsewhere = await createCandidate(otherListing, "F");
    expect(await compare(owner.id, [ids[0], elsewhere.id])).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    const withdrawn = await createCandidate(listing, "G", { status: "withdrawn" });
    expect(await compare(owner.id, [ids[0], withdrawn.id])).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });
});
