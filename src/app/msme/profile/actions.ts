"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { msmeProfileSchema } from "@/lib/profile-schemas";
import { saveMsmeProfile } from "@/lib/profiles";

export type MsmeProfileFormState =
  { status: "idle" } | { status: "error"; message: string; values: Record<string, string> };

export async function saveMsmeProfileAction(
  _prev: MsmeProfileFormState,
  formData: FormData,
): Promise<MsmeProfileFormState> {
  const session = await requireRole("msme");
  const values = Object.fromEntries(
    [...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  const parsed = msmeProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form",
      values,
    };
  }

  try {
    const result = await saveMsmeProfile(session.user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message: "Your review status changed while you were editing. Save again to continue.",
        values,
      };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "msme profile save failed");
    return { status: "error", message: "Something went wrong. Please try again.", values };
  }

  redirect("/msme");
}
