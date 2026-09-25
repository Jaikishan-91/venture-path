import { getSession } from "@/lib/authz";
import { getOwnResume } from "@/lib/resume-library";
import { readResume, resumeExtension, RESUME_TYPES } from "@/lib/resumes";

/** Download a resume from the signed-in user's own library. Organisations use the application route. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  const resume = await getOwnResume(session.user.id, (await params).id);
  if (!resume) return new Response("Not found", { status: 404 });

  const bytes = await readResume(resume.storageKey);
  const extension = resumeExtension(resume.storageKey) ?? "pdf";
  const filename = encodeURIComponent(resume.fileName);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": RESUME_TYPES[extension],
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
