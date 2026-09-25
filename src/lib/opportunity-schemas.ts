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
  };
});
export type OpportunityInput = z.output<typeof opportunitySchema>;
