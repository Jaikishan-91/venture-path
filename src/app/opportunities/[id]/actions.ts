"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { applyToOpportunity, MAX_NOTE_LENGTH, withdrawApplication } from "@/lib/applications";
import { getLogger } from "@/lib/logger";
import { displayFileName, resumeExtension, resumeFileError } from "@/lib/resumes";

export type ApplyState =
  { status: "idle" } | { status: "error"; message: string } | { status: "done" };

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const session = await requireRole("student");
  const opportunityId = formData.get("opportunityId");
  const note = formData.get("note");
  const file = formData.get("resume");
  if (typeof opportunityId !== "string" || typeof note !== "string") {
    return { status: "error", message: "Check the form" };
  }
  if (note.trim().length > MAX_NOTE_LENGTH) {
    return { status: "error", message: `Keep the note under ${MAX_NOTE_LENGTH} characters` };
  }
  if (!(file instanceof File)) return { status: "error", message: "Choose a resume file" };
  const fileError = resumeFileError(file);
  if (fileError) return { status: "error", message: fileError };
  const extension = resumeExtension(file.name);
  if (!extension) return { status: "error", message: "Resume must be a PDF, DOC or DOCX file" };

  try {
    const result = await applyToOpportunity(session.user.id, opportunityId, {
      note,
      fileName: displayFileName(file.name),
      extension,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if (!result.ok) {
      const messages = {
        needs_profile: "Create your profile before applying.",
        not_open: "This listing is no longer accepting applications.",
        already_applied: "You have already applied to this listing.",
      };
      return { status: "error", message: messages[result.reason] };
    }
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "application failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  revalidatePath(`/opportunities/${opportunityId}`);
  return { status: "done" };
}

export async function withdrawAction(formData: FormData): Promise<void> {
  const session = await requireRole("student");
  const id = formData.get("applicationId");
  if (typeof id === "string") await withdrawApplication(session.user.id, id);
  revalidatePath("/student/applications");
  revalidatePath("/opportunities");
}
