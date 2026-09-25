"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import {
  applyToOpportunity,
  MAX_NOTE_LENGTH,
  withdrawApplication,
  type ApplyFailure,
  type ApplyResume,
} from "@/lib/applications";
import { listQuestions } from "@/lib/opportunities";
import { parseAnswers } from "@/lib/opportunity-schemas";
import { MAX_LIBRARY_RESUMES } from "@/lib/resume-library";
import { getLogger } from "@/lib/logger";
import { displayFileName, resumeExtension, resumeFileError } from "@/lib/resumes";
import { flash } from "@/lib/flash";

export type ApplyState =
  { status: "idle" } | { status: "error"; message: string } | { status: "done" };

const APPLY_ERRORS: Record<ApplyFailure, string> = {
  needs_profile: "Create your profile before applying.",
  not_open: "This listing is no longer accepting applications.",
  already_applied: "You have already applied to this listing.",
  resume_not_found: "Choose one of your resumes.",
  resume_limit: `Your resume library is full (${MAX_LIBRARY_RESUMES}). Pick an existing resume or delete one first.`,
  answers_mismatch: "The questions changed. Reload the page and answer them again.",
};

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const session = await requireRole("user");
  const opportunityId = formData.get("opportunityId");
  const note = formData.get("note");
  const choice = formData.get("resumeChoice");
  if (typeof opportunityId !== "string" || typeof note !== "string" || typeof choice !== "string") {
    return { status: "error", message: "Check the form" };
  }
  if (note.trim().length > MAX_NOTE_LENGTH) {
    return { status: "error", message: `Keep the note under ${MAX_NOTE_LENGTH} characters` };
  }

  let resume: ApplyResume;
  if (choice === "upload") {
    const file = formData.get("resume");
    if (!(file instanceof File)) return { status: "error", message: "Choose a resume file" };
    const fileError = resumeFileError(file);
    if (fileError) return { status: "error", message: fileError };
    const extension = resumeExtension(file.name);
    if (!extension) return { status: "error", message: "Resume must be a PDF, DOC or DOCX file" };
    resume = {
      fileName: displayFileName(file.name),
      extension,
      bytes: Buffer.from(await file.arrayBuffer()),
    };
  } else {
    resume = { resumeId: choice };
  }

  try {
    const questions = await listQuestions(opportunityId);
    const answers = parseAnswers(
      questions.map((question) => question.id),
      formData.entries(),
    );
    if (!answers.ok) return { status: "error", message: answers.message };

    const result = await applyToOpportunity(session.user.id, opportunityId, {
      note,
      answers: answers.answers,
      ...resume,
    });
    if (!result.ok) return { status: "error", message: APPLY_ERRORS[result.reason] };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "application failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  await flash("success", "Application sent. The organisation will review it.");
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/user/resumes");
  return { status: "done" };
}

export async function withdrawAction(formData: FormData): Promise<void> {
  const session = await requireRole("user");
  const id = formData.get("applicationId");
  const result = typeof id === "string" ? await withdrawApplication(session.user.id, id) : null;
  await flash(
    result?.ok ? "success" : "error",
    result?.ok ? "Application withdrawn." : "This application can no longer be withdrawn.",
  );
  revalidatePath("/user/applications");
  revalidatePath("/opportunities");
}
