import { z } from "zod";
import { optionalText, requiredText, skillList } from "./profile-schemas";

export const OPPORTUNITY_TYPES = ["freelance", "internship"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export const OPPORTUNITY_STATUSES = ["draft", "published", "closed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export const WORK_MODES = ["remote", "onsite", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const PAY_TYPES = ["paid", "unpaid"] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const PAY_PERIODS = ["fixed", "month", "hour"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const EXPERIENCE_LEVELS = ["entry", "junior", "mid", "senior", "lead"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: "Entry level",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
};

export const MAX_OPPORTUNITY_SKILLS = 15;
export const MAX_PAY_AMOUNT = 10_000_000;

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  onsite: "On-site",
  hybrid: "Hybrid",
};
export const PAY_PERIOD_LABELS: Record<PayPeriod, string> = {
  fixed: "Fixed (whole project)",
  month: "Per month",
  hour: "Per hour",
};

/** Today's date in India as `YYYY-MM-DD`. */
export function todayInIndia(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** A deadline is the last day applications are accepted, in India time. */
export function isDeadlinePassed(deadline: Date | null, today = todayInIndia()): boolean {
  return deadline !== null && deadline.toISOString().slice(0, 10) < today;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatPay(opportunity: {
  payType: PayType;
  payAmount: number | null;
  payPeriod: PayPeriod | null;
}): string {
  if (opportunity.payType === "unpaid" || opportunity.payAmount === null) return "Unpaid";
  const amount = inr.format(opportunity.payAmount);
  if (opportunity.payPeriod === "month") return `${amount} / month`;
  if (opportunity.payPeriod === "hour") return `${amount} / hour`;
  return `${amount} fixed`;
}

/** Parse a compensation amount string: empty → null, digits → number, else NaN (which zod rejects). */
function parseCompensation(value: string): number | null {
  if (!value) return null;
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_PAY_AMOUNT
    ? Number(value)
    : NaN;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) =>
  DATE_PATTERN.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const fields = z.object({
  type: z.enum(OPPORTUNITY_TYPES, "Choose freelance or internship"),
  title: requiredText("a title", 120).refine(
    (title) => title.length >= 5,
    "Use at least 5 characters for the title",
  ),
  description: requiredText("a description", 5000),
  skills: skillList(MAX_OPPORTUNITY_SKILLS),
  workMode: z.enum(WORK_MODES, "Choose remote, on-site or hybrid"),
  city: optionalText("the city", 80),
  payType: z.enum(PAY_TYPES, "Choose paid or unpaid"),
  payAmount: z.string().trim().default(""),
  payPeriod: z.string().default(""),
  duration: optionalText("the duration", 60),
  deadline: z.string().trim().default(""),
  requirements: z.string().default("").pipe(optionalText("the requirements", 2000)),
  experienceLevel: z
    .string()
    .default("")
    .transform((value) => value.trim() || null)
    .pipe(z.enum(EXPERIENCE_LEVELS, "Choose an experience level").nullable()),
  compensationMin: z.string().trim().default(""),
  compensationMax: z.string().trim().default(""),
});

export const opportunitySchema = fields.transform((input, ctx) => {
  const issue = (path: string, message: string) => {
    ctx.addIssue({ code: "custom", path: [path], message });
  };

  if (input.workMode !== "remote" && !input.city) {
    issue("city", "Enter the city for on-site or hybrid work");
  }

  let payAmount: number | null = null;
  let payPeriod: PayPeriod | null = null;
  if (input.payType === "unpaid") {
    if (input.type === "freelance") issue("payType", "Freelance work must be paid");
  } else {
    payAmount = /^\d+$/.test(input.payAmount) ? Number(input.payAmount) : NaN;
    if (!(payAmount >= 1 && payAmount <= MAX_PAY_AMOUNT)) {
      issue("payAmount", "Enter the pay as a whole amount in rupees");
    }
    payPeriod = PAY_PERIODS.find((period) => period === input.payPeriod) ?? null;
    if (!payPeriod) issue("payPeriod", "Choose how the pay is counted");
  }

  const compensationMin = parseCompensation(input.compensationMin);
  const compensationMax = parseCompensation(input.compensationMax);
  if (Number.isNaN(compensationMin) || Number.isNaN(compensationMax)) {
    issue("compensationMin", "Enter compensation amounts as whole rupee values");
  }
  if (compensationMin !== null && compensationMax !== null && compensationMin > compensationMax) {
    issue("compensationMin", "Minimum compensation can't exceed maximum");
  }

  let deadline: Date | null = null;
  if (input.deadline) {
    if (!isRealDate(input.deadline)) {
      issue("deadline", "Enter a valid deadline date");
    } else if (input.deadline < todayInIndia()) {
      issue("deadline", "The deadline can't be in the past");
    } else {
      deadline = new Date(`${input.deadline}T00:00:00Z`);
    }
  }

  return {
    type: input.type,
    title: input.title,
    description: input.description,
    skills: input.skills,
    workMode: input.workMode,
    city: input.city,
    payType: input.payType,
    payAmount,
    payPeriod,
    duration: input.duration,
    deadline,
    requirements: input.requirements,
    experienceLevel: input.experienceLevel,
    compensationMin,
    compensationMax,
  };
});
export type OpportunityInput = z.output<typeof opportunitySchema>;

/** Screening questions (ADR-032). The AI drafts them; the organisation edits before anyone applies. */
export const MAX_QUESTIONS = 8;
export const MIN_QUESTION_LENGTH = 5;
export const MAX_QUESTION_LENGTH = 300;
export const MAX_ANSWER_LENGTH = 2000;
export const QUESTION_SOURCES = ["ai", "organisation"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];
export type QuestionInput = { prompt: string; source: QuestionSource };

/**
 * Questions from the listing form's repeated `questions` field; blanks and duplicates dropped.
 * A question is `ai` only when it is unchanged from a stored AI draft (`aiDrafts`); an edited
 * or new one is the organisation's. Returns an error message or the list.
 */
export function parseQuestions(
  prompts: string[],
  aiDrafts: readonly string[] = [],
): { ok: true; questions: QuestionInput[] } | { ok: false; message: string } {
  const questions: QuestionInput[] = [];
  const seen = new Set<string>();
  for (const raw of prompts) {
    const prompt = raw.replace(/\s+/g, " ").trim();
    if (!prompt) continue;
    if (prompt.length < MIN_QUESTION_LENGTH) {
      return { ok: false, message: `Use at least ${MIN_QUESTION_LENGTH} characters per question` };
    }
    if (prompt.length > MAX_QUESTION_LENGTH) {
      return { ok: false, message: `Keep each question under ${MAX_QUESTION_LENGTH} characters` };
    }
    if (seen.has(prompt.toLowerCase())) continue;
    seen.add(prompt.toLowerCase());
    questions.push({ prompt, source: aiDrafts.includes(prompt) ? "ai" : "organisation" });
  }
  if (questions.length > MAX_QUESTIONS) {
    return { ok: false, message: `Add at most ${MAX_QUESTIONS} questions` };
  }
  return { ok: true, questions };
}

/**
 * Answers from the apply form (`answer:<questionId>` fields) checked against the listing's
 * questions: every question answered, nothing extra, lengths within limits.
 */
export function parseAnswers(
  questionIds: readonly string[],
  entries: Iterable<[string, FormDataEntryValue]>,
): { ok: true; answers: Record<string, string> } | { ok: false; message: string } {
  const given = new Map<string, string>();
  for (const [name, value] of entries) {
    if (!name.startsWith("answer:") || typeof value !== "string") continue;
    given.set(name.slice("answer:".length), value.trim());
  }
  const answers: Record<string, string> = {};
  for (const id of questionIds) {
    const answer = given.get(id);
    if (!answer) return { ok: false, message: "Answer every question" };
    if (answer.length > MAX_ANSWER_LENGTH) {
      return { ok: false, message: `Keep each answer under ${MAX_ANSWER_LENGTH} characters` };
    }
    answers[id] = answer;
  }
  if ([...given.keys()].some((id) => !questionIds.includes(id))) {
    return { ok: false, message: "The questions changed. Reload the page." };
  }
  return { ok: true, answers };
}
