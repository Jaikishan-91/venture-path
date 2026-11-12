import { reissueInterviewLink } from "@/lib/ai-interview";
import { getSession } from "@/lib/authz";

/**
 * "Start / Continue interview" from My Applications. Issues a fresh private link for the signed-in
 * student's open AI interview and redirects to it (only token hashes are stored).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const back = new URL("/user/applications", request.url);
  const session = await getSession();
  if (!session || session.user.role !== "user") {
    return Response.redirect(new URL("/sign-in", request.url), 303);
  }
  const token = await reissueInterviewLink(session.user.id, (await params).applicationId);
  return Response.redirect(token ? new URL(`/interview/${token}`, request.url) : back, 303);
}
