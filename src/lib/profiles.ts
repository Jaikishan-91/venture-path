import { getDb } from "./db";
import { getLogger } from "./logger";
import {
  msmeProfileChanged,
  nextMsmeStatus,
  type MsmeProfileInput,
  type MsmeStatus,
  type StudentProfileInput,
} from "./profile-schemas";

export function getStudentProfile(userId: string) {
  return getDb().studentProfile.findUnique({ where: { userId } });
}

export function getMsmeProfile(userId: string) {
  return getDb().msmeProfile.findUnique({ where: { userId } });
}

export async function saveStudentProfile(
  userId: string,
  input: StudentProfileInput,
): Promise<void> {
  await getDb().studentProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  getLogger().info({ userId }, "student profile saved");
}

export type SaveMsmeProfileResult =
  { ok: true; status: MsmeStatus } | { ok: false; reason: "conflict" };

/** `userId` must come from the session. The status is derived here, never taken from input. */
export async function saveMsmeProfile(
  userId: string,
  input: MsmeProfileInput,
): Promise<SaveMsmeProfileResult> {
  const db = getDb();
  const logger = getLogger();
  const current = await db.msmeProfile.findUnique({ where: { userId } });

  if (!current) {
    await db.msmeProfile.create({ data: { userId, ...input, status: "pending" } });
    logger.info({ userId, status: "pending" }, "msme profile created");
    return { ok: true, status: "pending" };
  }

  const status = nextMsmeStatus(current.status, msmeProfileChanged(current, input));
  // Conditional on the status we read, so a concurrent review decision is never overwritten.
  const { count } = await db.msmeProfile.updateMany({
    where: { userId, status: current.status },
    data: { ...input, status },
  });
  if (count === 0) {
    logger.warn({ userId }, "msme profile save conflicted with a status change");
    return { ok: false, reason: "conflict" };
  }

  logger.info({ userId, from: current.status, to: status }, "msme profile saved");
  return { ok: true, status };
}
