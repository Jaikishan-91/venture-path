import "server-only";
import path from "node:path";
import type { FileChange } from "./challenges";
import { readUpload, uploadExtension, uploadFileError, UPLOAD_TYPES } from "./uploads";

/** Display name for an uploaded file: no path, only safe characters. */
export function uploadDisplayName(fileName: string): string {
  const base = path
    .basename(fileName.replace(/\\/g, "/"))
    .replace(/[^\w.\- ()[\]]+/g, "")
    .trim();
  return (base || "file").slice(0, 120);
}

/**
 * The file change a form asks for: field `file` (empty = keep) and checkbox `removeFile`.
 * Returns an error message for an unacceptable file.
 */
export async function readFormFile(
  formData: FormData,
): Promise<{ ok: true; file: FileChange } | { ok: false; message: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const error = uploadFileError(file);
    if (error) return { ok: false, message: error };
    const extension = uploadExtension(file.name)!;
    return {
      ok: true,
      file: {
        fileName: uploadDisplayName(file.name),
        extension,
        bytes: Buffer.from(await file.arrayBuffer()),
      },
    };
  }
  return { ok: true, file: formData.get("removeFile") === "on" ? null : undefined };
}

/** A stored upload as a download: attachment, never rendered inline. */
export async function uploadResponse(file: { fileKey: string; fileName: string }) {
  const bytes = await readUpload(file.fileKey);
  const extension = uploadExtension(file.fileKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": extension ? UPLOAD_TYPES[extension] : "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
