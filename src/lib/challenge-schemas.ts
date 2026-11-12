/**
 * Challenge validation and pure helpers (docs/PRODUCT.md Modules 1–2). Safe for client and server.
 */
import { z } from "zod";
import { todayInIndia } from "./opportunity-schemas";
import {
  CHALLENGE_SCORE_MAX,
  MAX_CHALLENGE_CRITERIA,
  MAX_CHALLENGE_GOOD_SOLUTION_LENGTH,
  MAX_CHALLENGE_PROBLEM_LENGTH,
  MAX_CHALLENGE_TITLE_LENGTH,
  MAX_CRITERION_LENGTH,
  MAX_HIRE_MESSAGE_LENGTH,
  MAX_REWARD_INR,
  MAX_SUBMISSION_TEXT_LENGTH,
  type ChallengePlacement,
  type ChallengeStatus,
  type CriterionScore,
} from "./v2/types";

/** Highest score of one judging point in `aiBreakdown`. */
export const CRITERION_SCORE_MAX = 5;
export const MAX_SUBMISSION_LINK_LENGTH = 500;
/** Used when the owner wrote no judging points, so scoring still has something to judge. */
export const DEFAULT_CRITERION = "Solves the business problem in a practical way";

const INDIA_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) =>
  DATE_PATTERN.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** A deadline date (`YYYY-MM-DD`) means "until the end of that day in India" (23:59:59.999 IST). */
export function deadlineFromIndiaDate(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS - 1 - INDIA_OFFSET_MS);
}

/** The India date (`YYYY-MM-DD`) a stored deadline falls on; the inverse of `deadlineFromIndiaDate`. */
export function indiaDateOfDeadline(deadline: Date): string {
  return new Date(deadline.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isChallengeDeadlinePassed(deadline: Date, now = new Date()): boolean {
  return now.getTime() > deadline.getTime();
}

/** Whole days left until the deadline, counting today; 0 once it has passed. */
export function daysLeft(deadline: Date, now = new Date()): number {
  const ms = deadline.getTime() - now.getTime();
  return ms < 0 ? 0 : Math.ceil(ms / DAY_MS);
}

export function daysLeftLabel(deadline: Date, now = new Date()): string {
  if (isChallengeDeadlinePassed(deadline, now)) return "Closed";
  const days = daysLeft(deadline, now);
  return days <= 1 ? "Last day" : `${days} days left`;
}

/** Open challenges past their deadline are being judged (the stored status is updated lazily). */
export function effectiveStatus(
  status: ChallengeStatus,
  deadline: Date,
  now = new Date(),
): ChallengeStatus {
  return status === "open" && isChallengeDeadlinePassed(deadline, now) ? "judging" : status;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const formatInr = (amount: number) => inr.format(amount);

/** e.g. "₹2,000 + Hiring", "Hiring", "₹500". */
export function formatReward(challenge: {
  rewardMoneyInr: number | null;
  rewardHire: boolean;
}): string {
  const parts: string[] = [];
  if (challenge.rewardMoneyInr !== null) parts.push(inr.format(challenge.rewardMoneyInr));
  if (challenge.rewardHire) parts.push("Hiring");
  return parts.join(" + ");
}

/** What the student sees as their result. Scores are never shown. */
export function studentResultLabel(
  status: ChallengeStatus,
  placement: ChallengePlacement,
): string | null {
  if (placement === "winner") return "Winner";
  if (placement === "runner_up") return "Runner-up";
  if (status === "done") return "Not selected";
  if (status === "judging") return "Being judged";
  return null;
}

/** Judging points from the form: trimmed, blanks and duplicates dropped. */
export function parseCriteria(
  values: string[],
): { ok: true; criteria: string[] } | { ok: false; message: string } {
  const criteria: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const criterion = raw.replace(/\s+/g, " ").trim();
    if (!criterion || seen.has(criterion.toLowerCase())) continue;
    if (criterion.length > MAX_CRITERION_LENGTH) {
      return {
        ok: false,
        message: `Keep each judging point under ${MAX_CRITERION_LENGTH} characters`,
      };
    }
    seen.add(criterion.toLowerCase());
    criteria.push(criterion);
  }
  if (criteria.length > MAX_CHALLENGE_CRITERIA) {
    return { ok: false, message: `Add at most ${MAX_CHALLENGE_CRITERIA} judging points` };
  }
  return { ok: true, criteria };
}

const text = (label: string, max: number) =>
  z
    .string(`Enter ${label}`)
    .trim()
    .min(1, `Enter ${label}`)
    .max(max, `Keep ${label} under ${max} characters`);

const challengeFields = z.object({
  title: text("a title", MAX_CHALLENGE_TITLE_LENGTH).refine(
    (title) => title.length >= 5,
    "Use at least 5 characters for the title",
  ),
  problem: text("the problem", MAX_CHALLENGE_PROBLEM_LENGTH),
  goodSolution: z
    .string()
    .default("")
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(
          MAX_CHALLENGE_GOOD_SOLUTION_LENGTH,
          `Keep "a good solution" under ${MAX_CHALLENGE_GOOD_SOLUTION_LENGTH} characters`,
        ),
    )
    .transform((value) => value || null),
  criteria: z.array(z.string()).default([]),
  rewardMoney: z.string().trim().default(""),
  /** Checkbox: "on" when ticked, absent otherwise. */
  rewardHire: z
    .string()
    .optional()
    .transform((value) => value === "on" || value === "true"),
  deadline: z.string().trim().default(""),
});

/** The challenge form. `today` is the India date, injectable for tests. */
export const challengeSchema = (today = todayInIndia()) =>
  challengeFields.transform((input, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    const criteria = parseCriteria(input.criteria);
    if (!criteria.ok) issue("criteria", criteria.message);

    let rewardMoneyInr: number | null = null;
    if (input.rewardMoney) {
      rewardMoneyInr = /^\d+$/.test(input.rewardMoney) ? Number(input.rewardMoney) : NaN;
      if (!(rewardMoneyInr >= 1 && rewardMoneyInr <= MAX_REWARD_INR)) {
        issue(
          "rewardMoney",
          `Enter the money reward as a whole amount in rupees (up to ${inr.format(MAX_REWARD_INR)})`,
        );
      }
    }
    if (rewardMoneyInr === null && !input.rewardHire) {
      issue("rewardMoney", "Add a reward: money, hiring, or both. Students don't work for free.");
    }

    let deadline = new Date(0);
    if (!isRealDate(input.deadline)) {
      issue("deadline", "Enter a valid deadline date");
    } else if (input.deadline < today) {
      issue("deadline", "The deadline can't be in the past");
    } else {
      deadline = deadlineFromIndiaDate(input.deadline);
    }

    return {
      title: input.title,
      problem: input.problem,
      goodSolution: input.goodSolution,
      criteria: criteria.ok ? criteria.criteria : [],
      rewardMoneyInr,
      rewardHire: input.rewardHire,
      deadline,
    };
  });
export type ChallengeInput = z.output<ReturnType<typeof challengeSchema>>;

const webLink = z
  .string()
  .trim()
  .max(MAX_SUBMISSION_LINK_LENGTH, `Keep the link under ${MAX_SUBMISSION_LINK_LENGTH} characters`)
  .transform((value) => value || null)
  .pipe(
    z
      .url({
        protocol: /^https?$/,
        hostname: z.regexes.domain,
        error: "Enter a full link starting with https://",
      })
      .nullable(),
  );

export const submissionSchema = z.object({
  text: text("your solution", MAX_SUBMISSION_TEXT_LENGTH),
  link: z.string().default("").pipe(webLink),
});
export type SubmissionInput = z.output<typeof submissionSchema>;

export const hireOfferSchema = z.object({
  message: z
    .string()
    .default("")
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(
          MAX_HIRE_MESSAGE_LENGTH,
          `Keep the message under ${MAX_HIRE_MESSAGE_LENGTH} characters`,
        ),
    ),
  opportunityId: z
    .string()
    .default("")
    .transform((value) => value.trim() || null)
    .pipe(z.uuid("Choose one of your listings").nullable()),
});
export type HireOfferInput = z.output<typeof hireOfferSchema>;

/** The 0–10 total, computed from the per-point scores (never trusted from the model). */
export function totalScore(breakdown: CriterionScore[]): number | null {
  if (breakdown.length === 0) return null;
  const sum = breakdown.reduce((acc, item) => acc + item.score, 0);
  return Math.round((sum / (breakdown.length * CRITERION_SCORE_MAX)) * CHALLENGE_SCORE_MAX);
}

/** Read `aiBreakdown` JSON defensively. */
export function readBreakdown(value: unknown): CriterionScore[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item &&
    typeof item === "object" &&
    typeof (item as CriterionScore).criterion === "string" &&
    typeof (item as CriterionScore).score === "number"
      ? [
          {
            criterion: (item as CriterionScore).criterion,
            score: (item as CriterionScore).score,
            quote:
              typeof (item as CriterionScore).quote === "string"
                ? (item as CriterionScore).quote
                : "",
          },
        ]
      : [],
  );
}

/** Sort for the organisation: highest AI score first, unscored last, then earliest submitted. */
export function compareByScore(
  a: { aiScore: number | null; submittedAt: Date },
  b: { aiScore: number | null; submittedAt: Date },
): number {
  if (a.aiScore !== b.aiScore) {
    if (a.aiScore === null) return 1;
    if (b.aiScore === null) return -1;
    return b.aiScore - a.aiScore;
  }
  return a.submittedAt.getTime() - b.submittedAt.getTime();
}
