"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { assignInitialRole } from "@/lib/user-roles";

export async function chooseRole(formData: FormData): Promise<void> {
  const session = await requireSession();
  await assignInitialRole(session.user.id, formData.get("role"));
  redirect("/dashboard");
}
