import { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";
import { embed, opportunityEmbeddingText, toVectorLiteral } from "./embeddings";
import { getLogger } from "./logger";
import {
  todayInIndia,
  type OpportunityType,
  type PayPeriod,
  type PayType,
  type WorkMode,
} from "./opportunity-schemas";
import type { BrowseParams } from "./search-params";

export const PAGE_SIZE = 20;
/** Minimum cosine similarity for a result that has no keyword match. Tuned on small test data. */
export const SEMANTIC_THRESHOLD = 0.3;

const KEYWORD_WEIGHTS = { title: 0.3, skills: 0.25, businessName: 0.2, description: 0.1 };

export type OpportunitySummary = {
  id: string;
  title: string;
  type: OpportunityType;
  workMode: WorkMode;
  city: string | null;
  payType: PayType;
  payAmount: number | null;
  payPeriod: PayPeriod | null;
  deadline: Date | null;
  skills: string[];
  publishedAt: Date | null;
  businessName: string;
};

/**
 * Visibility rule for anything shown outside the owning MSME: published, MSME approved,
 * deadline (last day to apply, India time) not passed. Mirrored in `visibleOpportunityWhere`.
 */
function visibleSql(today: string) {
  return Prisma.sql`o.status = 'published' AND m.status = 'approved'
    AND (o.deadline IS NULL OR o.deadline >= ${today}::date)`;
}

export function visibleOpportunityWhere(today = todayInIndia()): Prisma.OpportunityWhereInput {
  return {
    status: "published",
    msmeProfile: { status: "approved" },
    OR: [{ deadline: null }, { deadline: { gte: new Date(`${today}T00:00:00Z`) } }],
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function searchOpportunities(
  params: BrowseParams,
): Promise<{ results: OpportunitySummary[]; hasMore: boolean }> {
  const started = Date.now();
  const filters: Prisma.Sql[] = [visibleSql(todayInIndia())];
  if (params.type) filters.push(Prisma.sql`o.type = ${params.type}::"OpportunityType"`);
  if (params.workMode) filters.push(Prisma.sql`o."workMode" = ${params.workMode}::"WorkMode"`);
  if (params.city) filters.push(Prisma.sql`lower(trim(o.city)) = lower(${params.city})`);

  let order = Prisma.sql`o."publishedAt" DESC NULLS LAST, o.id`;
  if (params.q) {
    const vector = toVectorLiteral(await embed(params.q));
    const pattern = `%${escapeLike(params.q)}%`;
    const similarity = Prisma.sql`COALESCE(1 - (o.embedding <=> ${vector}::vector), 0)::float8`;
    const bonus = (weight: number) => Prisma.sql`${weight}::float8`;
    const keyword = Prisma.sql`(
      CASE WHEN o.title ILIKE ${pattern} ESCAPE '\\' THEN ${bonus(KEYWORD_WEIGHTS.title)} ELSE 0::float8 END +
      CASE WHEN EXISTS (SELECT 1 FROM unnest(o.skills) s WHERE s ILIKE ${pattern} ESCAPE '\\')
        THEN ${bonus(KEYWORD_WEIGHTS.skills)} ELSE 0::float8 END +
      CASE WHEN m."businessName" ILIKE ${pattern} ESCAPE '\\' THEN ${bonus(KEYWORD_WEIGHTS.businessName)} ELSE 0::float8 END +
      CASE WHEN o.description ILIKE ${pattern} ESCAPE '\\' THEN ${bonus(KEYWORD_WEIGHTS.description)} ELSE 0::float8 END
    )`;
    filters.push(Prisma.sql`(${similarity} >= ${SEMANTIC_THRESHOLD}::float8 OR ${keyword} > 0)`);
    order = Prisma.sql`(${similarity} + ${keyword}) DESC, o.id`;
  }

  const rows = await getDb().$queryRaw<OpportunitySummary[]>`
    SELECT o.id, o.title, o.type::text AS type, o."workMode"::text AS "workMode", o.city,
      o."payType"::text AS "payType", o."payAmount", o."payPeriod"::text AS "payPeriod",
      o.deadline, o.skills, o."publishedAt", m."businessName"
    FROM opportunity o
    JOIN msme_profile m ON m.id = o."msmeProfileId"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY ${order}
    LIMIT ${PAGE_SIZE + 1} OFFSET ${(params.page - 1) * PAGE_SIZE}`;

  getLogger().info(
    { results: rows.length, hasQuery: Boolean(params.q), ms: Date.now() - started },
    "opportunity search",
  );
  return { results: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/** Distinct cities of visible listings, for the location filter. */
export async function listVisibleCities(): Promise<string[]> {
  const rows = await getDb().$queryRaw<{ city: string }[]>`
    SELECT min(trim(o.city)) AS city
    FROM opportunity o
    JOIN msme_profile m ON m.id = o."msmeProfileId"
    WHERE ${visibleSql(todayInIndia())} AND o.city IS NOT NULL AND trim(o.city) <> ''
    GROUP BY lower(trim(o.city))
    ORDER BY 1`;
  return rows.map((row) => row.city);
}

export function getVisibleOpportunity(id: string) {
  return getDb().opportunity.findFirst({
    where: { id, ...visibleOpportunityWhere() },
    include: {
      msmeProfile: {
        select: {
          businessName: true,
          industry: true,
          location: true,
          website: true,
          description: true,
          user: { select: { email: true } },
        },
      },
    },
  });
}

export async function refreshOpportunityEmbedding(id: string): Promise<void> {
  const db = getDb();
  const opportunity = await db.opportunity.findUnique({
    where: { id },
    select: { title: true, type: true, skills: true, description: true },
  });
  if (!opportunity) return;
  const vector = await embed(opportunityEmbeddingText(opportunity));
  await db.$executeRaw`UPDATE opportunity SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${id}`;
}
