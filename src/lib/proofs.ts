import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { runProofCheck } from "./proof-check";
import { sortByProofLevel, type ProofInput } from "./proof-schemas";
import { deleteUpload, saveUpload, type UploadExtension } from "./uploads";
import { MAX_MANUAL_PROOFS, type ProofFailure, type Result } from "./v2/types";

/**
 * Proof cards (docs/PRODUCT.md Module 3). This package writes `manual` and `apply_task` proofs;
 * `challenge` proofs belong to the challenges package and are read-only here. `level` is set only
 * by app code (`proof-check.ts`), never from form input.
 */

const logger = getLogger();

export type ProofFile = { fileName: string; extension: UploadExtension; bytes: Buffer };

/** What the student and organisations see on a card. AI score fields are left out on purpose. */
export const PROOF_CARD_SELECT = {
  id: true,
  title: true,
  whatIDid: true,
  link: true,
  fileName: true,
  skills: true,
  source: true,
  level: true,
  createdAt: true,
} as const satisfies Prisma.ProofSelect;

const profileOf = (userId: string) =>
  getDb().userProfile.findUnique({ where: { userId }, select: { id: true } });

/** The student's proof cards, strongest badge first. */
export async function listOwnProofs(userId: string) {
  const proofs = await getDb().proof.findMany({
    where: { userProfile: { userId } },
    select: {
      ...PROOF_CARD_SELECT,
      aiScoreStatus: true,
      _count: { select: { applications: { where: { status: { not: "withdrawn" } } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return sortByProofLevel(proofs);
}

/** Proof cards that are part of an application the organisation still has (not withdrawn). */
const lockedWhere: Prisma.ProofWhereInput = {
  applications: { some: { status: { not: "withdrawn" } } },
};

export async function createProof(
  userId: string,
  input: ProofInput,
  file: ProofFile | null,
): Promise<Result<{ id: string }, ProofFailure>> {
  const profile = await profileOf(userId);
  if (!profile) return { ok: false, reason: "not_found" };
  if (!input.link && !file) return { ok: false, reason: "invalid" };
  const count = await getDb().proof.count({
    where: { userProfileId: profile.id, source: "manual" },
  });
  if (count >= MAX_MANUAL_PROOFS) return { ok: false, reason: "too_many" };

  const fileKey = file ? await saveUpload(file.extension, file.bytes) : null;
  const { id } = await getDb().proof.create({
    data: {
      userProfileId: profile.id,
      source: "manual",
      title: input.title,
      whatIDid: input.whatIDid,
      link: input.link,
      skills: input.skills,
      fileKey,
      fileName: file?.fileName ?? null,
    },
    select: { id: true },
  });
  logger.info({ userId, proofId: id }, "proof created");
  startProofCheck(id);
  return { ok: true, id };
}

/**
 * Edit a manual proof. `file` replaces the stored file; `removeFile` drops it. The badge goes back
 * to ⚪ and the check runs again. Locked while attached to an active application.
 */
export async function updateProof(
  userId: string,
  proofId: string,
  input: ProofInput,
  options: { file: ProofFile | null; removeFile: boolean },
): Promise<Result<object, ProofFailure>> {
  const db = getDb();
  const proof = await db.proof.findFirst({
    where: { id: proofId, userProfile: { userId } },
    select: {
      source: true,
      fileKey: true,
      _count: { select: { applications: { where: { status: { not: "withdrawn" } } } } },
    },
  });
  if (!proof) return { ok: false, reason: "not_found" };
  if (proof.source !== "manual" || proof._count.applications > 0) {
    return { ok: false, reason: "locked" };
  }
  const keepsFile = !options.file && !options.removeFile && proof.fileKey !== null;
  if (!input.link && !options.file && !keepsFile) return { ok: false, reason: "invalid" };

  const newKey = options.file ? await saveUpload(options.file.extension, options.file.bytes) : null;
  const fileData = options.file
    ? { fileKey: newKey, fileName: options.file.fileName }
    : options.removeFile
      ? { fileKey: null, fileName: null }
      : {};
  const { count } = await db.proof.updateMany({
    where: { id: proofId, userProfile: { userId }, source: "manual", NOT: lockedWhere },
    data: {
      title: input.title,
      whatIDid: input.whatIDid,
      link: input.link,
      skills: input.skills,
      ...fileData,
      level: "added",
      aiScore: null,
      aiReason: null,
      aiScoreStatus: "pending",
      checkedAt: null,
    },
  });
  if (count === 0) {
    if (newKey) await deleteUpload(newKey);
    return { ok: false, reason: "locked" };
  }
  if (proof.fileKey && (options.file || options.removeFile)) await deleteUpload(proof.fileKey);
  logger.info({ userId, proofId }, "proof updated");
  startProofCheck(proofId);
  return { ok: true };
}

/** Delete a manual proof (and its file). Locked while attached to an active application. */
export async function deleteProof(
  userId: string,
  proofId: string,
): Promise<Result<object, ProofFailure>> {
  const db = getDb();
  const proof = await db.proof.findFirst({
    where: { id: proofId, userProfile: { userId } },
    select: { source: true, fileKey: true },
  });
  if (!proof) return { ok: false, reason: "not_found" };
  if (proof.source !== "manual") return { ok: false, reason: "locked" };
  const { count } = await db.proof.deleteMany({
    where: { id: proofId, userProfile: { userId }, source: "manual", NOT: lockedWhere },
  });
  if (count === 0) return { ok: false, reason: "locked" };
  if (proof.fileKey) await deleteUpload(proof.fileKey);
  logger.info({ userId, proofId }, "proof deleted");
  return { ok: true };
}

/** Runs in the background; a failed check leaves the card ⚪ with status pending/failed. */
export function startProofCheck(proofId: string) {
  runInBackground("proof check", { proofId }, () => runProofCheck(proofId));
}

/**
 * A proof file, readable by the student who owns it or by an organisation that received an
 * application with this proof attached. Null when not allowed or there is no file.
 */
export async function getProofFileForUser(userId: string, proofId: string) {
  const proof = await getDb().proof.findFirst({
    where: {
      id: proofId,
      fileKey: { not: null },
      OR: [
        { userProfile: { userId } },
        { applications: { some: { opportunity: { organisationProfile: { userId } } } } },
      ],
    },
    select: { fileKey: true, fileName: true },
  });
  return proof?.fileKey ? { fileKey: proof.fileKey, fileName: proof.fileName ?? "proof" } : null;
}
