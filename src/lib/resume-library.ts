import "server-only";
import type { Resume } from "@/generated/prisma/client";
import { runInBackground } from "./background";
import { getDb } from "./db";
import { getLogger } from "./logger";
import { asData, parseJsonObject, stringList } from "./llm/json";
import { buildPrompt, DATA_SYSTEM_MESSAGE, getPromptContent } from "./llm/prompts";
import { createLlmClient } from "./llm/provider";
import { MAX_RESUME_CHARS, readResumeText } from "./resume-analysis";
import { deleteResume, displayFileName, saveResume, type ResumeExtension } from "./resumes";
import { normalizeSkills } from "./skills";

/** Resumes a user can keep in their library (ADR-031). */
export const MAX_LIBRARY_RESUMES = 5;
export const MAX_RESUME_SKILLS = 30;

export type LibraryFailure = "needs_profile" | "limit" | "not_found";
export type LibraryResult<T = object> = ({ ok: true } & T) | { ok: false; reason: LibraryFailure };

/** Scopes a query to resumes of the user whose account ID is `userId` (from the session). */
const ownedBy = (userId: string) => ({ userProfile: { userId } });

export function listResumes(userId: string) {
  return getDb().resume.findMany({
    where: ownedBy(userId),
    orderBy: { createdAt: "desc" },
  });
}

export function getOwnResume(userId: string, resumeId: string) {
  return getDb().resume.findFirst({ where: { id: resumeId, ...ownedBy(userId) } });
}

/**
 * Store a new resume in the user's library and extract its skills in the background.
 * Refused when the library already holds `MAX_LIBRARY_RESUMES`.
 */
export async function addResume(
  userId: string,
  input: { fileName: string; extension: ResumeExtension; bytes: Buffer },
): Promise<LibraryResult<{ resume: Resume }>> {
  const db = getDb();
  const profile = await db.userProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, reason: "needs_profile" };
  if ((await db.resume.count({ where: { userProfileId: profile.id } })) >= MAX_LIBRARY_RESUMES) {
    return { ok: false, reason: "limit" };
  }

  const storageKey = await saveResume(input.extension, input.bytes);
  let resume: Resume | null;
  try {
    resume = await db.$transaction(async (tx) => {
      // Lock the profile row so one user's parallel uploads can't both pass the cap. Other
      // users' uploads are not blocked (Serializable isolation made them conflict).
      await tx.$queryRaw`SELECT id FROM user_profile WHERE id = ${profile.id} FOR UPDATE`;
      const count = await tx.resume.count({ where: { userProfileId: profile.id } });
      if (count >= MAX_LIBRARY_RESUMES) return null;
      return tx.resume.create({
        data: { userProfileId: profile.id, fileName: input.fileName, storageKey },
      });
    });
  } catch (err) {
    await deleteResume(storageKey);
    throw err;
  }
  if (!resume) {
    await deleteResume(storageKey);
    return { ok: false, reason: "limit" };
  }
  const created = resume;

  getLogger().info({ userId, resumeId: created.id }, "resume added to library");
  runInBackground("resume skill extraction", { resumeId: created.id }, () =>
    extractResumeSkills(created.id),
  );
  return { ok: true, resume: created };
}

export async function renameResume(
  userId: string,
  resumeId: string,
  name: string,
): Promise<LibraryResult> {
  const fileName = displayFileName(name);
  const { count } = await getDb().resume.updateMany({
    where: { id: resumeId, ...ownedBy(userId) },
    data: { fileName },
  });
  return count === 0 ? { ok: false, reason: "not_found" } : { ok: true };
}

/**
 * Remove a resume from the library. Applications made with it keep their snapshot, so the
 * file is deleted only when no application references it.
 */
export async function removeResume(userId: string, resumeId: string): Promise<LibraryResult> {
  const db = getDb();
  const resume = await getOwnResume(userId, resumeId);
  if (!resume) return { ok: false, reason: "not_found" };
  await db.resume.delete({ where: { id: resume.id } });
  await deleteStoredFileIfUnreferenced(resume.storageKey);
  getLogger().info({ userId, resumeId }, "resume removed from library");
  return { ok: true };
}

/** Delete a stored resume file unless a library resume or an application still uses it. */
export async function deleteStoredFileIfUnreferenced(storageKey: string): Promise<void> {
  const db = getDb();
  const [resumes, applications] = await Promise.all([
    db.resume.count({ where: { storageKey } }),
    db.application.count({ where: { resumeStorageKey: storageKey } }),
  ]);
  if (resumes === 0 && applications === 0) await deleteResume(storageKey);
}

/** Parse the skills reply. Pure, for tests. */
export function parseResumeSkills(content: string): string[] | null {
  const parsed = parseJsonObject(content);
  if (!parsed || !Array.isArray(parsed.skills)) return null;
  return normalizeSkills(stringList(parsed.skills, 60), MAX_RESUME_SKILLS);
}

/**
 * Extract a library resume's skills with the LLM (ADR-031) and record the outcome:
 * `skipped` without an LLM, `failed` when the text can't be read or the reply is unusable.
 */
export async function extractResumeSkills(resumeId: string): Promise<Resume | null> {
  const db = getDb();
  const logger = getLogger();
  const resume = await db.resume.findUnique({ where: { id: resumeId } });
  if (!resume) return null;

  const client = createLlmClient();
  if (!client) {
    return db.resume.update({ where: { id: resumeId }, data: { skillsStatus: "skipped" } });
  }
  await db.resume.update({ where: { id: resumeId }, data: { skillsStatus: "pending" } });

  const text = await readResumeText(resume.storageKey);
  const content = text
    ? await client.chat([
        { role: "system", content: DATA_SYSTEM_MESSAGE },
        {
          role: "user",
          content: buildPrompt(await getPromptContent("resume_skills"), {
            maxSkills: String(MAX_RESUME_SKILLS),
            resumeText: asData("resume", text, MAX_RESUME_CHARS),
          }),
        },
      ])
    : null;
  const skills = content ? parseResumeSkills(content) : null;

  const updated = await db.resume.updateMany({
    where: { id: resumeId },
    data: skills
      ? { skills, skillsStatus: "done", skillsModel: client.model }
      : { skillsStatus: "failed" },
  });
  logger.info(
    {
      resumeId,
      status: skills ? "done" : "failed",
      skills: skills?.length,
      hadText: Boolean(text),
    },
    "resume skill extraction finished",
  );
  return updated.count === 0 ? null : db.resume.findUnique({ where: { id: resumeId } });
}

/** Re-run skill extraction for one of the user's own resumes. */
export async function retryResumeSkills(userId: string, resumeId: string): Promise<LibraryResult> {
  const resume = await getOwnResume(userId, resumeId);
  if (!resume) return { ok: false, reason: "not_found" };
  await extractResumeSkills(resume.id);
  return { ok: true };
}

/**
 * The skills used to recommend jobs (ADR-033): the union of skills extracted from the user's
 * resumes, or the profile's skills when no resume has extracted skills yet.
 */
export async function candidateSkills(
  userId: string,
): Promise<{ skills: string[]; source: "resumes" | "profile" | "none" }> {
  const db = getDb();
  const resumes = await db.resume.findMany({
    where: { ...ownedBy(userId), skillsStatus: "done" },
    select: { skills: true },
  });
  const fromResumes = normalizeSkills(
    resumes.flatMap((resume) => resume.skills),
    Number.POSITIVE_INFINITY,
  );
  if (fromResumes.length > 0) return { skills: fromResumes, source: "resumes" };

  const profile = await db.userProfile.findUnique({ where: { userId }, select: { skills: true } });
  const fromProfile = normalizeSkills(profile?.skills ?? [], Number.POSITIVE_INFINITY);
  return fromProfile.length > 0
    ? { skills: fromProfile, source: "profile" }
    : { skills: [], source: "none" };
}
