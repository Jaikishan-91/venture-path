import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Files attached to challenges, challenge submissions and proof cards (docs/PRODUCT.md Modules 1–3).
 * Same storage rules as resumes (`resumes.ts`): generated keys, never client paths.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;
export type UploadExtension = keyof typeof UPLOAD_TYPES;

const ALLOWED_MIME = new Set<string>([
  "",
  "application/octet-stream",
  ...Object.values(UPLOAD_TYPES),
]);

export function uploadsDirectory(): string {
  return process.env.FILES_DIR ?? path.join(process.cwd(), "uploads", "files");
}

export function uploadExtension(fileName: string): UploadExtension | null {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  return ext in UPLOAD_TYPES ? (ext as UploadExtension) : null;
}

/** Returns an error message, or null when the file is acceptable. An empty file means "no file". */
export function uploadFileError(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return "File must be 5 MB or smaller";
  if (!uploadExtension(file.name) || !ALLOWED_MIME.has(file.type)) {
    return "File must be a PDF, Word, Excel, CSV, PowerPoint, PNG or JPG file";
  }
  return null;
}

export async function saveUpload(extension: UploadExtension, bytes: Buffer): Promise<string> {
  const key = `${randomUUID()}.${extension}`;
  const directory = uploadsDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, key), bytes);
  return key;
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  if (path.basename(storageKey) !== storageKey) throw new Error("invalid file key");
  return readFile(path.join(uploadsDirectory(), storageKey));
}

export async function deleteUpload(storageKey: string): Promise<void> {
  if (path.basename(storageKey) !== storageKey) return;
  await rm(path.join(uploadsDirectory(), storageKey), { force: true });
}
