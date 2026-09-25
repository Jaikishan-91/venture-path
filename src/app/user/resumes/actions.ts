"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { flash } from "@/lib/flash";
import { getLogger } from "@/lib/logger";
import {
  addResume,
  MAX_LIBRARY_RESUMES,
  removeResume,
  renameResume,
  retryResumeSkills,
  type LibraryFailure,
} from "@/lib/resume-library";
import { displayFileName, resumeExtension, resumeFileError } from "@/lib/resumes";

export type ResumeFormState = { status: "idle" } | { status: "error"; message: string };

const FAILURES: Record<LibraryFailure, string> = {
  needs_profile: "Create your profile before adding resumes.",
  limit: `You can keep up to ${MAX_LIBRARY_RESUMES} resumes. Delete one first.`,
  not_found: "This resume doesn't exist.",
};

export async function uploadResumeAction(
  _prev: ResumeFormState,
  formData: FormData,
): Promise<ResumeFormState> {
  const session = await requireRole("user");
  const file = formData.get("resume");
  if (!(file instanceof File)) return { status: "error", message: "Choose a resume file" };
  const fileError = resumeFileError(file);
  if (fileError) return { status: "error", message: fileError };
  const extension = resumeExtension(file.name);
  if (!extension) return { status: "error", message: "Resume must be a PDF, DOC or DOCX file" };

  try {
    const result = await addResume(session.user.id, {
      fileName: displayFileName(file.name),
      extension,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if (!result.ok) return { status: "error", message: FAILURES[result.reason] };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "resume upload failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  await flash("success", "Resume added. Skills are being extracted.");
  revalidatePath("/user/resumes");
  return { status: "idle" };
}

/** Rename, delete or retry skill extraction, chosen by the submit button's `intent`. */
export async function manageResumeAction(formData: FormData): Promise<void> {
  const session = await requireRole("user");
  const id = formData.get("id");
  const intent = formData.get("intent");
  if (typeof id !== "string" || !id) return;

  try {
    if (intent === "rename") {
      const name = formData.get("name");
      if (typeof name !== "string" || !name.trim()) {
        await flash("error", "Enter a name for the resume.");
      } else {
        const result = await renameResume(session.user.id, id, name);
        await flash(
          result.ok ? "success" : "error",
          result.ok ? "Resume renamed." : FAILURES[result.reason],
        );
      }
    } else if (intent === "delete") {
      const result = await removeResume(session.user.id, id);
      await flash(
        result.ok ? "success" : "error",
        result.ok
          ? "Resume deleted. Applications you sent with it are unchanged."
          : FAILURES[result.reason],
      );
    } else if (intent === "retry") {
      const result = await retryResumeSkills(session.user.id, id);
      await flash(
        result.ok ? "info" : "error",
        result.ok ? "Skill extraction finished." : FAILURES[result.reason],
      );
    }
  } catch (err) {
    getLogger().error(
      { userId: session.user.id, resumeId: id, intent, err },
      "resume action failed",
    );
    await flash("error", "Something went wrong. Please try again.");
  }
  revalidatePath("/user/resumes");
}
