"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { organisationProfileSchema } from "@/lib/profile-schemas";
import { saveOrganisationProfile } from "@/lib/profiles";
import { flash } from "@/lib/flash";

export type OrganisationProfileFormState =
  { status: "idle" } | { status: "error"; message: string; values: Record<string, string> };

export async function saveOrganisationProfileAction(
  _prev: OrganisationProfileFormState,
  formData: FormData,
): Promise<OrganisationProfileFormState> {
  const session = await requireRole("organisation");
  const values = Object.fromEntries(
    [...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  const parsed = organisationProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form",
      values,
    };
  }

  try {
    const result = await saveOrganisationProfile(session.user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: "Your review status changed while you were editing. Save again to continue.",
        values,
      };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "Organisation profile save failed");
    return { status: "error", message: "Something went wrong. Please try again.", values };
  }

  await flash("success", "Profile saved. An admin reviews changes before your listings go live.");
  redirect("/organisation");
}
