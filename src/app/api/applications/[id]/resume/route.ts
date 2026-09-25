import { getSession } from "@/lib/authz";
import { getResumeForUser } from "@/lib/applications";
import { readResume, resumeExtension, RESUME_TYPES } from "@/lib/resumes";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  const application = await getResumeForUser(session.user.id, (await params).id);
  if (!application) return new Response("Not found", { status: 404 });

  const bytes = await readResume(application.resumeStorageKey);
  const extension = resumeExtension(application.resumeStorageKey) ?? "pdf";
  const filename = encodeURIComponent(application.resumeFileName);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": RESUME_TYPES[extension],
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
