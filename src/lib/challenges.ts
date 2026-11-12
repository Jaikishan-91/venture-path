import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { getLogger } from "./logger";
import {
  isChallengeDeadlinePassed,
  type ChallengeInput,
  type SubmissionInput,
} from "./challenge-schemas";
import { scoreSubmission } from "./challenge-scoring";
import { deleteUpload, saveUpload, type UploadExtension } from "./uploads";
import {
  MAX_PROOF_TITLE_LENGTH,
  MAX_PROOF_WHAT_I_DID_LENGTH,
  type ChallengeFailure,
  type Result,
} from "./v2/types";

/** A file from a form, already validated with `uploadFileError` and named with `displayFileName`. */
export type UploadInput = { fileName: string; extension: UploadExtension; bytes: Buffer };
/** `undefined` keeps the current file, `null` removes it, an upload replaces it. */
export type FileChange = UploadInput | null | undefined;

export type ChallengeResult<T = object> = Result<T, ChallengeFailure>;

const fail = (reason: ChallengeFailure, message?: string) =>
  ({ ok: false, reason, ...(message ? { message } : {}) }) as const;

/** Scopes a query to challenges owned by the organisation user `userId` (from the session). */
const ownedBy = (userId: string) => ({ organisationProfile: { userId } });

/** Public challenges: not drafts, from approved organisations. */
const visibleWhere = {
  status: { not: "draft" as const },
  organisationProfile: { status: "approved" as const },
};

/**
 * Move open challenges whose deadline has passed to `judging`. Called before reads, so the
 * stored status never lags behind the clock where it matters (no scheduler needed).
 */
export async function refreshExpiredChallenges(now = new Date()): Promise<void> {
  await getDb().challenge.updateMany({
    where: { status: "open", deadline: { lt: now } },
    data: { status: "judging" },
  });
}

function getApprovedProfile(userId: string) {
  return getDb().organisationProfile.findFirst({
    where: { userId, status: "approved" },
    select: { id: true },
  });
}

async function storeFile(file: UploadInput) {
  return { fileKey: await saveUpload(file.extension, file.bytes), fileName: file.fileName };
}

async function tryDelete(key: string | null | undefined) {
  if (!key) return;
  try {
    await deleteUpload(key);
  } catch (err) {
    getLogger().error({ err }, "upload delete failed");
  }
}

// ---------------------------------------------------------------------------------------------
// Organisation: post and manage
// ---------------------------------------------------------------------------------------------

export async function listOwnChallenges(userId: string) {
  await refreshExpiredChallenges();
  return getDb().challenge.findMany({
    where: ownedBy(userId),
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function getOwnChallenge(userId: string, id: string) {
  await refreshExpiredChallenges();
  return getDb().challenge.findFirst({
    where: { id, ...ownedBy(userId) },
    include: { _count: { select: { submissions: true } } },
  });
}

export async function createChallenge(
  userId: string,
  input: ChallengeInput,
  options: { publish: boolean; file?: UploadInput | null; aiAssisted?: boolean },
): Promise<ChallengeResult<{ id: string }>> {
  const profile = await getApprovedProfile(userId);
  if (!profile) return fail("not_approved");
  if (options.publish && isChallengeDeadlinePassed(input.deadline)) return fail("deadline_passed");

  const file = options.file ? await storeFile(options.file) : {};
  const now = new Date();
  const { id } = await getDb().challenge.create({
    data: {
      ...input,
      ...file,
      organisationProfileId: profile.id,
      status: options.publish ? "open" : "draft",
      publishedAt: options.publish ? now : null,
      aiAssistedAt: options.aiAssisted ? now : null,
    },
    select: { id: true },
  });
  getLogger().info({ userId, challengeId: id, publish: options.publish }, "challenge created");
  return { ok: true, id };
}

/**
 * Edit a draft or open challenge. Once the first submission has arrived, the judging points and
 * the reward are locked: students entered on those terms.
 */
export async function updateChallenge(
  userId: string,
  id: string,
  input: ChallengeInput,
  options: { publish: boolean; file?: FileChange; aiAssisted?: boolean },
): Promise<ChallengeResult> {
  const profile = await getApprovedProfile(userId);
  if (!profile) return fail("not_approved");
  await refreshExpiredChallenges();
  const current = await getDb().challenge.findFirst({
    where: { id, organisationProfileId: profile.id },
  });
  if (!current) return fail("not_found");
  if (current.status !== "draft" && current.status !== "open") return fail("wrong_status");
  if (isChallengeDeadlinePassed(input.deadline)) return fail("deadline_passed");

  if (current.criteriaLockedAt) {
    const sameCriteria =
      current.criteria.length === input.criteria.length &&
      current.criteria.every((criterion, index) => criterion === input.criteria[index]);
    if (!sameCriteria) {
      return fail("invalid", "Students have already entered, so the judging points can't change.");
    }
    if (
      current.rewardMoneyInr !== input.rewardMoneyInr ||
      current.rewardHire !== input.rewardHire
    ) {
      return fail("invalid", "Students have already entered, so the reward can't change.");
    }
  }

  const fileData =
    options.file === undefined
      ? {}
      : options.file === null
        ? { fileKey: null, fileName: null }
        : await storeFile(options.file);
  const publishing = options.publish && current.status === "draft";
  const now = new Date();
  const { count } = await getDb().challenge.updateMany({
    where: { id, organisationProfileId: profile.id, status: current.status },
    data: {
      ...input,
      ...fileData,
      ...(publishing ? { status: "open" as const, publishedAt: now } : {}),
      ...(options.aiAssisted ? { aiAssistedAt: now } : {}),
    },
  });
  if (count === 0) {
    if ("fileKey" in fileData) await tryDelete(fileData.fileKey);
    return fail("wrong_status");
  }
  if (options.file !== undefined) await tryDelete(current.fileKey);
  getLogger().info({ userId, challengeId: id, publishing }, "challenge updated");
  return { ok: true };
}

export async function publishChallenge(userId: string, id: string): Promise<ChallengeResult> {
  const profile = await getApprovedProfile(userId);
  if (!profile) return fail("not_approved");
  const current = await getDb().challenge.findFirst({
    where: { id, organisationProfileId: profile.id },
    select: { status: true, deadline: true, rewardMoneyInr: true, rewardHire: true },
  });
  if (!current) return fail("not_found");
  if (current.status !== "draft") return fail("wrong_status");
  if (current.rewardMoneyInr === null && !current.rewardHire) return fail("no_reward");
  if (isChallengeDeadlinePassed(current.deadline)) return fail("deadline_passed");
  const { count } = await getDb().challenge.updateMany({
    where: { id, organisationProfileId: profile.id, status: "draft" },
    data: { status: "open", publishedAt: new Date() },
  });
  if (count === 0) return fail("wrong_status");
  getLogger().info({ userId, challengeId: id }, "challenge published");
  return { ok: true };
}

/** Stop taking submissions before the deadline: open → judging. */
export async function stopSubmissions(userId: string, id: string): Promise<ChallengeResult> {
  const { count } = await getDb().challenge.updateMany({
    where: { id, status: "open", ...ownedBy(userId) },
    data: { status: "judging" },
  });
  if (count === 0) {
    const exists = await getDb().challenge.findFirst({ where: { id, ...ownedBy(userId) } });
    return fail(exists ? "wrong_status" : "not_found");
  }
  getLogger().info({ userId, challengeId: id }, "challenge submissions stopped");
  return { ok: true };
}

export async function deleteDraftChallenge(userId: string, id: string): Promise<ChallengeResult> {
  const draft = await getDb().challenge.findFirst({
    where: { id, ...ownedBy(userId) },
    select: { status: true, fileKey: true },
  });
  if (!draft) return fail("not_found");
  const { count } = await getDb().challenge.deleteMany({
    where: { id, status: "draft", ...ownedBy(userId) },
  });
  if (count === 0) return fail("wrong_status");
  await tryDelete(draft.fileKey);
  getLogger().info({ userId, challengeId: id }, "draft challenge deleted");
  return { ok: true };
}

/** The organisation's published listings, for the optional link in a hire offer. */
export function listOwnPublishedListings(userId: string) {
  return getDb().opportunity.findMany({
    where: { status: "published", ...ownedBy(userId) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
}

// ---------------------------------------------------------------------------------------------
// Public browse
// ---------------------------------------------------------------------------------------------

const businessSelect = { select: { businessName: true, industry: true, location: true } };

/** Open challenges, soonest deadline first. */
export async function listOpenChallenges() {
  await refreshExpiredChallenges();
  return getDb().challenge.findMany({
    where: { ...visibleWhere, status: "open" },
    orderBy: { deadline: "asc" },
    select: {
      id: true,
      title: true,
      rewardMoneyInr: true,
      rewardHire: true,
      deadline: true,
      organisationProfile: businessSelect,
    },
  });
}

/** A challenge anyone may view (not a draft, approved organisation). */
export async function getVisibleChallenge(id: string) {
  await refreshExpiredChallenges();
  return getDb().challenge.findFirst({
    where: { id, ...visibleWhere },
    include: { organisationProfile: businessSelect },
  });
}

/** The attachment of a challenge the user may view: public, or their own (drafts included). */
export async function getChallengeFile(id: string, viewerUserId: string | null) {
  const challenge = await getDb().challenge.findFirst({
    where: {
      id,
      OR: [visibleWhere, ...(viewerUserId ? [ownedBy(viewerUserId)] : [])],
    },
    select: { fileKey: true, fileName: true },
  });
  return challenge?.fileKey && challenge.fileName
    ? { fileKey: challenge.fileKey, fileName: challenge.fileName }
    : null;
}

// ---------------------------------------------------------------------------------------------
// Students: submit
// ---------------------------------------------------------------------------------------------

/** The student's own submission to a challenge, without any AI fields. */
export function getOwnSubmission(userId: string, challengeId: string) {
  return getDb().challengeSubmission.findFirst({
    where: { challengeId, userProfile: { userId } },
    select: {
      id: true,
      text: true,
      link: true,
      fileName: true,
      placement: true,
      rewardStatus: true,
      submittedAt: true,
      updatedAt: true,
    },
  });
}

/** "Your submissions" on /challenges. Never includes scores. */
export async function listOwnSubmissions(userId: string) {
  await refreshExpiredChallenges();
  return getDb().challengeSubmission.findMany({
    where: { userProfile: { userId } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      placement: true,
      updatedAt: true,
      challenge: {
        select: {
          id: true,
          title: true,
          status: true,
          deadline: true,
          rewardMoneyInr: true,
          rewardHire: true,
          organisationProfile: { select: { businessName: true } },
        },
      },
    },
  });
}

/** Proof card fields for a submission (docs/PRODUCT.md Module 3; WP-A owns `source = challenge`). */
function proofFields(challengeTitle: string, input: SubmissionInput) {
  return {
    title: challengeTitle.slice(0, MAX_PROOF_TITLE_LENGTH),
    whatIDid: input.text.slice(0, MAX_PROOF_WHAT_I_DID_LENGTH),
    link: input.link,
  };
}

/**
 * Create or edit the student's one submission while the challenge is open. The proof card
 * mirrors it (file copied under its own key), and AI scoring and the similarity check run in
 * the background.
 */
export async function submitSolution(
  userId: string,
  challengeId: string,
  input: SubmissionInput,
  file: FileChange,
): Promise<ChallengeResult<{ id: string; created: boolean }>> {
  const db = getDb();
  const profile = await db.userProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return fail("invalid", "Create your profile before submitting.");

  await refreshExpiredChallenges();
  const challenge = await db.challenge.findFirst({
    where: { id: challengeId, ...visibleWhere },
    select: { id: true, title: true, status: true, deadline: true },
  });
  if (!challenge) return fail("not_found");
  if (isChallengeDeadlinePassed(challenge.deadline)) return fail("deadline_passed");
  if (challenge.status !== "open") return fail("wrong_status");

  const existing = await db.challengeSubmission.findUnique({
    where: { challengeId_userProfileId: { challengeId, userProfileId: profile.id } },
    select: { id: true, fileKey: true, fileName: true, proof: { select: { fileKey: true } } },
  });

  // Store new files before the transaction; remove them again if it fails.
  const submissionFile = file ? await storeFile(file) : undefined;
  const proofFile = file ? await storeFile(file) : undefined;
  const fileData =
    file === undefined ? {} : file === null ? { fileKey: null, fileName: null } : submissionFile!;
  const proofFileData =
    file === undefined
      ? existing
        ? {}
        : { fileKey: null, fileName: null }
      : file === null
        ? { fileKey: null, fileName: null }
        : proofFile!;
  const resetScore = {
    aiScore: null,
    aiScoreStatus: "pending" as const,
    aiReason: null,
    aiQuote: null,
    aiBreakdown: Prisma.DbNull,
    aiModel: null,
    similarToId: null,
  };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const submission = existing
        ? await tx.challengeSubmission.update({
            where: { id: existing.id },
            data: { ...input, ...fileData, ...resetScore },
            select: { id: true },
          })
        : await tx.challengeSubmission.create({
            data: { challengeId, userProfileId: profile.id, ...input, ...fileData },
            select: { id: true },
          });
      await tx.proof.upsert({
        where: { challengeSubmissionId: submission.id },
        create: {
          userProfileId: profile.id,
          ...proofFields(challenge.title, input),
          ...proofFileData,
          source: "challenge",
          challengeSubmissionId: submission.id,
          level: "added",
          // The proof AI check is for manual proofs (WP-B); a challenge proof is judged here.
          aiScoreStatus: "skipped",
        },
        update: { ...proofFields(challenge.title, input), ...proofFileData },
      });
      // The first submission locks the judging points (and the reward, see updateChallenge).
      await tx.challenge.updateMany({
        where: { id: challengeId, criteriaLockedAt: null },
        data: { criteriaLockedAt: new Date() },
      });
      return submission.id;
    });
  } catch (err) {
    await tryDelete(submissionFile?.fileKey);
    await tryDelete(proofFile?.fileKey);
    throw err;
  }

  if (existing && file !== undefined) {
    await tryDelete(existing.fileKey);
    await tryDelete(existing.proof?.fileKey);
  }
  getLogger().info(
    { userId, challengeId, submissionId: id, created: !existing },
    "challenge submission saved",
  );
  runInBackground("challenge scoring", { submissionId: id }, () => scoreSubmission(id));
  return { ok: true, id, created: !existing };
}

/** A submission file: only the student who submitted it or the organisation that owns the challenge. */
export async function getSubmissionFile(submissionId: string, viewerUserId: string) {
  const submission = await getDb().challengeSubmission.findFirst({
    where: {
      id: submissionId,
      OR: [{ userProfile: { userId: viewerUserId } }, { challenge: ownedBy(viewerUserId) }],
    },
    select: { fileKey: true, fileName: true },
  });
  return submission?.fileKey && submission.fileName
    ? { fileKey: submission.fileKey, fileName: submission.fileName }
    : null;
}
