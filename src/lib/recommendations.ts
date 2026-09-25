import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { embed, toVectorLiteral } from "./embeddings";
import { getLogger } from "./logger";
import { todayInIndia, type WorkMode } from "./opportunity-schemas";
import { candidateSkills } from "./resume-library";
import { visibleSql } from "./search";
import { MATCH_THRESHOLD, matchScore, skillCoverage } from "./skills";

/** Visible listings scored per request; the MVP has few enough that coverage is computed in code. */
const CANDIDATE_POOL = 300;

export type Recommendation = {
  id: string;
  title: string;
  businessName: string;
  workMode: WorkMode;
  city: string | null;
  deadline: Date | null;
  /** 0–100, rounded. */
  match: number;
  matchedSkills: string[];
  requiredSkills: string[];
};

type Row = Omit<Recommendation, "match" | "matchedSkills" | "requiredSkills"> & {
  skills: string[];
  similarity: number;
};

/**
 * Jobs for a user, ranked by their skills (ADR-033): 70% share of the listing's required skills
 * the user has, 30% semantic similarity between the user's skills and the listing. Only visible
 * listings the user hasn't applied to. Returns `source: "none"` when the user has no skills.
 */
export async function recommendOpportunities(
  userId: string,
  take: number,
): Promise<{ items: Recommendation[]; source: "resumes" | "profile" | "none" }> {
  const { skills, source } = await candidateSkills(userId);
  if (skills.length === 0) return { items: [], source };

  const started = Date.now();
  let similarity = Prisma.sql`0::float8`;
  try {
    const vector = toVectorLiteral(await embed(skills.slice(0, 40).join(", ")));
    similarity = Prisma.sql`COALESCE(1 - (o.embedding <=> ${vector}::vector), 0)::float8`;
  } catch (err) {
    // Without the embedding model, rank by skill coverage alone.
    getLogger().warn({ err }, "recommendation embedding failed; using skill coverage only");
  }

  const rows = await getDb().$queryRaw<Row[]>`
    SELECT o.id, o.title, o."workMode"::text AS "workMode", o.city, o.deadline, o.skills,
      m."businessName", ${similarity} AS similarity
    FROM opportunity o
    JOIN organisation_profile m ON m.id = o."organisationProfileId"
    WHERE ${visibleSql(todayInIndia())}
      AND NOT EXISTS (
        SELECT 1 FROM application a
        JOIN user_profile p ON p.id = a."userProfileId"
        WHERE a."opportunityId" = o.id AND p."userId" = ${userId}
      )
    ORDER BY ${similarity} DESC, o."publishedAt" DESC NULLS LAST, o.id
    LIMIT ${CANDIDATE_POOL}`;

  const items = rankRecommendations(rows, skills).slice(0, take);
  getLogger().info(
    { userId, source, candidates: rows.length, results: items.length, ms: Date.now() - started },
    "recommendations",
  );
  return { items, source };
}

/** Score, filter and sort listings for a candidate's skills. Pure, for tests. */
export function rankRecommendations(rows: Row[], skills: string[]): Recommendation[] {
  return rows
    .map(({ skills: required, similarity, ...row }) => {
      const { coverage, matched } = skillCoverage(required, skills);
      const score = matchScore(coverage, Number(similarity));
      return { ...row, score, matchedSkills: matched, requiredSkills: required };
    })
    .filter((row) => row.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...row }) => ({ ...row, match: Math.round(score * 100) }));
}
