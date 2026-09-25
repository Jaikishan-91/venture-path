"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { reviewMsme } from "@/lib/msme-review";
import { reviewInputSchema } from "@/lib/msme-review-schema";

export type ReviewFormState = { status: "idle" } | { status: "error"; message: string };

export async function reviewMsmeAction(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const session = await requireRole("admin");
  const parsed = reviewInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  try {
    const result = await reviewMsme(session.user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.reason === "changed"
            ? "This profile changed since you opened the page. Reload and review it again."
            : "This MSME no longer exists.",
      };
    }
  } catch (err) {
    getLogger().error({ adminId: session.user.id, err }, "msme review failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin", "layout");
  return { status: "idle" };
}
