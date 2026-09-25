"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { studentProfileSchema } from "@/lib/profile-schemas";
import { saveStudentProfile } from "@/lib/profiles";

export type StudentProfileFormState =
  { status: "idle" } | { status: "error"; message: string; values: Record<string, string> };

export async function saveStudentProfileAction(
  _prev: StudentProfileFormState,
  formData: FormData,
): Promise<StudentProfileFormState> {
  const session = await requireRole("student");
  const values = Object.fromEntries(
    [...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  const parsed = studentProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form",
      values,
    };
  }

  try {
    await saveStudentProfile(session.user.id, parsed.data);
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "student profile save failed");
    return { status: "error", message: "Something went wrong. Please try again.", values };
  }

  redirect("/student");
}
