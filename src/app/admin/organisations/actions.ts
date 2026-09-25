"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { reviewOrganisation } from "@/lib/organisation-review";
import { reviewInputSchema } from "@/lib/organisation-review-schema";
import { flash } from "@/lib/flash";

export type ReviewFormState = { status: "idle" } | { status: "error"; message: string };

export async function reviewOrganisationAction(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const session = await requireRole("admin");
  const parsed = reviewInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  try {
    const result = await reviewOrganisation(session.user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.reason === "changed"
            ? "This profile changed since you opened the page. Reload and review it again."
            : "This organisation no longer exists.",
      };
    }
  } catch (err) {
    getLogger().error({ adminId: session.user.id, err }, "Organisation review failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  await flash(
    "success",
    parsed.data.decision === "approve" ? "Organisation approved." : "Organisation rejected.",
  );
  revalidatePath("/admin", "layout");
  return { status: "idle" };
}
