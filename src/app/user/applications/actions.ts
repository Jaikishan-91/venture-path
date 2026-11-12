"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { flash } from "@/lib/flash";
import { respondToOffer } from "@/lib/offers";

/** The student's Accept / Decline on an offer (only their own application). */
export async function respondToOfferAction(formData: FormData): Promise<void> {
  const session = await requireRole("user");
  const applicationId = formData.get("applicationId");
  const answer = formData.get("answer");
  if (typeof applicationId !== "string") return;
  const result = await respondToOffer(session.user.id, applicationId, answer);
  await flash(
    result.ok ? "success" : "error",
    result.ok
      ? result.hired
        ? "Offer accepted. Congratulations, you're hired!"
        : "Offer declined. The business has been told."
      : "This offer can't be answered any more. Reload the page.",
  );
  revalidatePath("/user/applications");
  revalidatePath("/user");
}
