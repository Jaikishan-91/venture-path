import { getSession } from "@/lib/authz";
import { getChallengeFile } from "@/lib/challenges";
import { uploadResponse } from "@/lib/challenge-uploads";

/** The challenge's attachment: anyone who can view the challenge (public, or the owner's draft). */
export async function GET(_request: Request, ctx: RouteContext<"/api/challenges/[id]/file">) {
  const session = await getSession();
  const file = await getChallengeFile((await ctx.params).id, session?.user.id ?? null);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    return await uploadResponse(file);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
