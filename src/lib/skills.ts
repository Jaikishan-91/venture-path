/**
 * Skill normalisation and matching (ADR-033). Pure, so it is shared by the LLM parsers, the
 * listing assist merge and the recommendation query, and unit-tested without a database.
 */

export const MAX_SKILL_LENGTH = 40;

/**
 * Common spellings of the same skill. Intentionally small: the semantic similarity term in
 * recommendations covers near-synonyms this map misses.
 */
const ALIASES: Record<string, string> = {
  reactjs: "react",
  "react.js": "react",
  "react js": "react",
  node: "node.js",
  nodejs: "node.js",
  "node js": "node.js",
  "vue.js": "vue",
  vuejs: "vue",
  "next.js": "nextjs",
  "next js": "nextjs",
  "express.js": "express",
  expressjs: "express",
  js: "javascript",
  ts: "typescript",
  golang: "go",
  postgres: "postgresql",
  "postgre sql": "postgresql",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "c sharp": "c#",
  "c++ programming": "c++",
  ml: "machine learning",
  ai: "artificial intelligence",
};

/** Lowercase, trim, collapse whitespace, strip surrounding punctuation, apply the alias map. */
export function normalizeSkill(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}#+.]+|[^\p{L}\p{N}#+]+$/gu, "")
    .slice(0, MAX_SKILL_LENGTH)
    .trim();
  return ALIASES[cleaned] ?? cleaned;
}

/** Normalise, drop empties and duplicates, keep first-seen order, cap the length. */
export function normalizeSkills(values: readonly unknown[], max: number): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const skill = normalizeSkill(value);
    if (skill) seen.add(skill);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** The organisation's own skills first, then AI suggestions that aren't already present. */
export function mergeSkills(own: readonly string[], suggested: readonly string[], max: number) {
  return normalizeSkills([...own, ...suggested], max);
}

/** Share of `required` found in `candidate` (0–1), and which ones matched. Empty required → 0. */
export function skillCoverage(required: readonly string[], candidate: readonly string[]) {
  const have = new Set(candidate.map(normalizeSkill));
  const wanted = normalizeSkills(required, Number.POSITIVE_INFINITY);
  const matched = wanted.filter((skill) => have.has(skill));
  return { coverage: wanted.length === 0 ? 0 : matched.length / wanted.length, matched };
}

/** Recommendation weights (ADR-033): required-skill coverage dominates, semantics break ties. */
export const MATCH_WEIGHTS = { coverage: 0.7, similarity: 0.3 } as const;
/** Minimum match score for a listing to be recommended. Tuned on small test data. */
export const MATCH_THRESHOLD = 0.25;

export function matchScore(coverage: number, similarity: number): number {
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
  return MATCH_WEIGHTS.coverage * clamp(coverage) + MATCH_WEIGHTS.similarity * clamp(similarity);
}

/** Screening weights (ADR-033): overall = 60% resume + 40% answers. */
export const SCORE_WEIGHTS = { resume: 0.6, answers: 0.4 } as const;

/**
 * Overall score from whichever parts succeeded. Both → weighted; one → that one; none → null.
 * A listing without questions has no answers score, so the resume score is the overall score.
 */
export function combineScores(resumeScore: number | null, answersScore: number | null) {
  if (resumeScore !== null && answersScore !== null) {
    return Math.round(SCORE_WEIGHTS.resume * resumeScore + SCORE_WEIGHTS.answers * answersScore);
  }
  return resumeScore ?? answersScore ?? null;
}

/** Parse an LLM score: a number (or numeric string) in 0–100, rounded; anything else → null. */
export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : Number(value);
  return raw >= 0 && raw <= 100 ? Math.round(raw) : null;
}
