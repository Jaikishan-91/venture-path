"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { runInBackground } from "@/lib/background";
import { getLogger } from "@/lib/logger";
import {
  changeOpportunityStatus,
  createOpportunity,
  deleteDraftOpportunity,
  getOwnOpportunity,
  updateOpportunity,
  type OpportunityFailure,
  type OpportunityResult,
} from "@/lib/opportunities";
import { parseQuestions, opportunitySchema } from "@/lib/opportunity-schemas";
import { flash } from "@/lib/flash";
import { assistListing, assistOwnListing, type AssistResult } from "@/lib/listing-assist";

const FAILURE_MESSAGES: Record<OpportunityFailure, string> = {
  not_approved: "Your business must be approved by an admin before you can do this.",
  not_found: "This listing doesn't exist.",
  invalid_state: "This listing's status changed. Reload the page.",
  deadline_passed: "The deadline has passed. Edit the listing and set a new deadline first.",
  questions_locked: "Someone has applied, so the questions can't change. Reload the page.",
};

export type OpportunityFormState = { status: "idle" } | { status: "error"; message: string };

export async function saveOpportunityAction(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const session = await requireRole("organisation");
  const values = Object.fromEntries(
    [...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  values.skills = formData
    .getAll("skills")
    .filter((value): value is string => typeof value === "string")
    .join(", ");

  const parsed = opportunitySchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  // Locked question lists are shown read-only and not submitted: leave them untouched.
  const questions = values.questionsEditable
    ? parseQuestions(
        formData.getAll("questions").filter((value): value is string => typeof value === "string"),
      )
    : null;
  if (questions && !questions.ok) return { status: "error", message: questions.message };

  let result: OpportunityResult<{ id?: string }>;
  try {
    result = values.id
      ? await updateOpportunity(session.user.id, values.id, parsed.data, questions?.questions)
      : await createOpportunity(session.user.id, parsed.data, questions?.questions ?? []);
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "opportunity save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: FAILURE_MESSAGES[result.reason] };

  if (values.id) {
    await flash("success", "Listing updated.");
    redirect("/organisation/opportunities");
  }

  // New listing: ask the AI for required skills and draft questions, then let the organisation review.
  const id = result.id as string;
  const assist = await runAssist(session.user.id, id, () =>
    assistListing(id, { draftQuestions: true }),
  );
  if (assist?.ok && (assist.addedSkills.length > 0 || assist.addedQuestions > 0)) {
    await flash("success", `Draft saved. ${describeAssist(assist)} Review them before publishing.`);
    redirect(`/organisation/opportunities/${id}/edit`);
  }
  // No LLM configured is normal (AI is optional); a configured LLM that failed is worth saying.
  const aiFailed = assist === null || (!assist.ok && assist.reason !== "no_llm");
  await flash(
    aiFailed ? "info" : "success",
    aiFailed
      ? "Draft saved. AI suggestions are unavailable right now; you can try again from the edit page."
      : "Draft saved. Publish it when it's ready.",
  );
  redirect("/organisation/opportunities");
}

/** The assist never fails a save: errors are logged and reported as unavailable. */
async function runAssist(
  userId: string,
  opportunityId: string,
  run: () => Promise<AssistResult>,
): Promise<AssistResult | null> {
  try {
    return await run();
  } catch (err) {
    getLogger().error({ userId, opportunityId, err }, "listing assist failed");
    return null;
  }
}

function describeAssist(assist: { addedSkills: string[]; addedQuestions: number }): string {
  const parts: string[] = [];
  if (assist.addedSkills.length > 0) {
    parts.push(
      `AI added ${assist.addedSkills.length} skill${assist.addedSkills.length === 1 ? "" : "s"}`,
    );
  }
  if (assist.addedQuestions > 0) {
    parts.push(
      `${parts.length > 0 ? "drafted" : "AI drafted"} ${assist.addedQuestions} question${assist.addedQuestions === 1 ? "" : "s"}`,
    );
  }
  return `${parts.join(" and ")}.`;
}

/** "Suggest with AI" on the edit page: merge skills and draft questions if there are none. */
export async function assistOpportunityAction(formData: FormData): Promise<void> {
  const session = await requireRole("organisation");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/organisation/opportunities");

  const assist = await runAssist(session.user.id, id, () =>
    assistOwnListing(session.user.id, id, { draftQuestions: true }),
  );
  if (assist?.ok) {
    const changed = assist.addedSkills.length > 0 || assist.addedQuestions > 0;
    await flash(
      changed ? "success" : "info",
      changed ? describeAssist(assist) : "AI found nothing to add.",
    );
  } else {
    await flash(
      "error",
      assist?.reason === "not_found"
        ? FAILURE_MESSAGES.not_found
        : "AI suggestions are unavailable right now. Try again later.",
    );
  }
  revalidatePath(`/organisation/opportunities/${id}/edit`);
  redirect(`/organisation/opportunities/${id}/edit`);
}

const STATUS_MESSAGES: Record<"publish" | "close" | "reopen" | "delete", string> = {
  publish: "Listing published.",
  close: "Listing closed.",
  reopen: "Listing reopened.",
  delete: "Draft deleted.",
};

export type StatusFormState = { status: "idle" } | { status: "error"; message: string };

export async function opportunityStatusAction(
  _prev: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  const session = await requireRole("organisation");
  const id = formData.get("id");
  const action = formData.get("action");
  if (typeof id !== "string" || !id) return { status: "error", message: "Missing listing" };

  let result: OpportunityResult;
  try {
    if (action === "delete") {
      result = await deleteDraftOpportunity(session.user.id, id);
    } else if (action === "publish" || action === "close" || action === "reopen") {
      result = await changeOpportunityStatus(session.user.id, id, action);
    } else {
      return { status: "error", message: "Unknown action" };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "opportunity status change failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: FAILURE_MESSAGES[result.reason] };

  if (action === "publish") {
    // A listing that was never assisted (AI was down at create) gets its skills extracted now.
    // Skills only: questions must be reviewed by the organisation before anyone sees them.
    const opportunity = await getOwnOpportunity(session.user.id, id);
    if (opportunity && !opportunity.aiAssistedAt) {
      runInBackground("listing assist", { opportunityId: id }, () =>
        assistListing(id, { draftQuestions: false }),
      );
    }
  }

  await flash("success", STATUS_MESSAGES[action]);
  revalidatePath("/organisation/opportunities");
  return { status: "idle" };
}
