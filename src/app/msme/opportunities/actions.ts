"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import {
  changeOpportunityStatus,
  createOpportunity,
  deleteDraftOpportunity,
  updateOpportunity,
  type OpportunityFailure,
  type OpportunityResult,
} from "@/lib/opportunities";
import { opportunitySchema } from "@/lib/opportunity-schemas";

const FAILURE_MESSAGES: Record<OpportunityFailure, string> = {
  not_approved: "Your business must be approved by an admin before you can do this.",
  not_found: "This listing doesn't exist.",
  invalid_state: "This listing's status changed. Reload the page.",
  deadline_passed: "The deadline has passed. Edit the listing and set a new deadline first.",
};

export type OpportunityFormState = { status: "idle" } | { status: "error"; message: string };

export async function saveOpportunityAction(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const session = await requireRole("msme");
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

  let result: OpportunityResult;
  try {
    result = values.id
      ? await updateOpportunity(session.user.id, values.id, parsed.data)
      : await createOpportunity(session.user.id, parsed.data);
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "opportunity save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: FAILURE_MESSAGES[result.reason] };

  redirect("/msme/opportunities");
}

export type StatusFormState = { status: "idle" } | { status: "error"; message: string };

export async function opportunityStatusAction(
  _prev: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  const session = await requireRole("msme");
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

  revalidatePath("/msme/opportunities");
  return { status: "idle" };
}
