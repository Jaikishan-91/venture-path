"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/authz";
import { flash } from "@/lib/flash";
import { getLogger } from "@/lib/logger";
import { proofSchema } from "@/lib/proof-schemas";
import { createProof, deleteProof, updateProof, type ProofFile } from "@/lib/proofs";
import { displayFileName } from "@/lib/resumes";
import { uploadExtension, uploadFileError } from "@/lib/uploads";
import { MAX_MANUAL_PROOFS, type ProofFailure } from "@/lib/v2/types";

export type ProofFormState =
  { status: "idle" } | { status: "error"; message: string } | { status: "saved" };

const FAILURES: Record<ProofFailure, string> = {
  not_found: "This proof card doesn't exist. Create your profile first if you haven't.",
  invalid: "Add a link or a file so others can see your work.",
  too_many: `You can keep up to ${MAX_MANUAL_PROOFS} proof cards. Delete one first.`,
  locked:
    "This card is attached to an application or comes from a challenge, so it can't be changed.",
};

/** Add or edit a manual proof card (the form never sends a badge level). */
export async function saveProofAction(
  _prev: ProofFormState,
  formData: FormData,
): Promise<ProofFormState> {
  const session = await requireRole("user");
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = proofSchema.safeParse({
    title: text("title"),
    link: text("link"),
    whatIDid: text("whatIDid"),
    skills: text("skills"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  let file: ProofFile | null = null;
  const upload = formData.get("file");
  if (upload instanceof File && upload.size > 0) {
    const fileError = uploadFileError(upload);
    const extension = uploadExtension(upload.name);
    if (fileError || !extension) return { status: "error", message: fileError ?? "Check the file" };
    file = {
      fileName: displayFileName(upload.name),
      extension,
      bytes: Buffer.from(await upload.arrayBuffer()),
    };
  }

  const id = text("id");
  try {
    const result = id
      ? await updateProof(session.user.id, id, parsed.data, {
          file,
          removeFile: formData.get("removeFile") === "on",
        })
      : await createProof(session.user.id, parsed.data, file);
    if (!result.ok) return { status: "error", message: FAILURES[result.reason] };
  } catch (err) {
    getLogger().error({ userId: session.user.id, err }, "proof save failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  await flash(
    "success",
    id ? "Proof card updated. Checking it again…" : "Proof card added. Checking it…",
  );
  revalidatePath("/user/proof");
  return { status: "saved" };
}

export async function deleteProofAction(formData: FormData): Promise<void> {
  const session = await requireRole("user");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  try {
    const result = await deleteProof(session.user.id, id);
    await flash(
      result.ok ? "success" : "error",
      result.ok ? "Proof card deleted." : FAILURES[result.reason],
    );
  } catch (err) {
    getLogger().error({ userId: session.user.id, proofId: id, err }, "proof delete failed");
    await flash("error", "Something went wrong. Please try again.");
  }
  revalidatePath("/user/proof");
}
