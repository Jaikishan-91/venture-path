"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { decideApplication } from "@/lib/applications";

export async function decideAction(formData: FormData): Promise<void> {
  const session = await requireRole("msme");
  const id = formData.get("applicationId");
  const decision = formData.get("decision");
  if (typeof id === "string" && (decision === "accepted" || decision === "rejected")) {
    await decideApplication(session.user.id, id, decision);
  }
  revalidatePath("/msme/opportunities");
}
