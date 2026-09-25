"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { assignInitialRole } from "@/lib/user-roles";
import { flash } from "@/lib/flash";

export async function chooseRole(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (await assignInitialRole(session.user.id, formData.get("role"))) {
    await flash("success", "You're all set. Welcome to VenturePath.");
  }
  redirect("/dashboard");
}
