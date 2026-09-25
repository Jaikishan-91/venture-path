"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { userProfileSchema } from "@/lib/profile-schemas";
import { saveUserProfile } from "@/lib/profiles";
import { flash } from "@/lib/flash";

export type UserProfileFormState =
  { status: "idle" } | { status: "error"; message: string; values: Record<string, string> };

export async function saveUserProfileAction(
  _prev: UserProfileFormState,
  formData: FormData,
): Promise<UserProfileFormState> {
  const session = await requireRole("user");
  const values = Object.fromEntries(
    [...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  values.skills = formData
    .getAll("skills")
    .filter((value): value is string => typeof value === "string")
    .join(", ");
  values.links = formData
    .getAll("links")
    .filter((value): value is string => typeof value === "string")
    .join("\n");

  const parsed = userProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form",
      values,
    };
  }

  try {
    await saveUserProfile(session.user.id, parsed.data);
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "user profile save failed");
    return { status: "error", message: "Something went wrong. Please try again.", values };
  }

  await flash("success", "Profile saved.");
  redirect("/user");
}
