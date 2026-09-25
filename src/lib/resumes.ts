import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type ResumeExtension = keyof typeof RESUME_TYPES;

const ALLOWED_MIME = new Set<string>([
  "",
  "application/octet-stream",
  ...Object.values(RESUME_TYPES),
]);

export function resumesDirectory(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "resumes");
}

export function resumeExtension(fileName: string): ResumeExtension | null {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return ext in RESUME_TYPES ? (ext as ResumeExtension) : null;
}

/** Returns an error message, or null when the file is acceptable. */
export function resumeFileError(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "Choose a resume file";
  if (file.size > MAX_RESUME_BYTES) return "Resume must be 5 MB or smaller";
  if (!resumeExtension(file.name)) return "Resume must be a PDF, DOC or DOCX file";
  if (!ALLOWED_MIME.has(file.type)) return "Resume must be a PDF, DOC or DOCX file";
  return null;
}

export function displayFileName(fileName: string): string {
  const base = path
    .basename(fileName)
    .replace(/[^\w.\- ()[\]]+/g, "")
    .trim();
  return (base || "resume").slice(0, 120);
}

export async function saveResume(extension: ResumeExtension, bytes: Buffer): Promise<string> {
  const key = `${randomUUID()}.${extension}`;
  const directory = resumesDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), bytes);
  return key;
}

export async function readResume(storageKey: string): Promise<Buffer> {
  if (path.basename(storageKey) !== storageKey) throw new Error("invalid resume key");
  return readFile(path.join(resumesDirectory(), storageKey));
}

export async function deleteResume(storageKey: string): Promise<void> {
  if (path.basename(storageKey) !== storageKey) return;
  await rm(path.join(resumesDirectory(), storageKey), { force: true });
}
