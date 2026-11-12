import { getSession } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { getProofFileForUser } from "@/lib/proofs";
import { readUpload, uploadExtension, UPLOAD_TYPES } from "@/lib/uploads";

/**
 * Download a proof card's file: the student who owns it, or an organisation that received an
 * application with this proof attached (docs/PRODUCT.md Module 3).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  const file = await getProofFileForUser(session.user.id, (await params).id);
  if (!file) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readUpload(file.fileKey);
  } catch (err) {
    getLogger().warn({ err, userId: session.user.id }, "proof file missing");
    return new Response("Not found", { status: 404 });
  }
  const extension = uploadExtension(file.fileKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": extension ? UPLOAD_TYPES[extension] : "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
