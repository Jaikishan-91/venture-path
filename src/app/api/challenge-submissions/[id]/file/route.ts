import { getSession } from "@/lib/authz";
import { getSubmissionFile } from "@/lib/challenges";
import { uploadResponse } from "@/lib/challenge-uploads";

/** A submission's file: only the student who submitted it or the organisation that owns the challenge. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/challenge-submissions/[id]/file">,
) {
  const session = await getSession();
  if (!session) return new Response("Sign in required", { status: 401 });
  const file = await getSubmissionFile((await ctx.params).id, session.user.id);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    return await uploadResponse(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
