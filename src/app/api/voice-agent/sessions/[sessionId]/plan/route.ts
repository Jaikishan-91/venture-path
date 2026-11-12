import { getVoicePlan, isValidVoiceAgentSecret } from "@/lib/ai-interview-voice";
import { VOICE_AGENT_SECRET_HEADER } from "@/lib/v2/types";

/** Voice agent → app: the question plan for a live voice session (shared-secret auth). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isValidVoiceAgentSecret(request.headers.get(VOICE_AGENT_SECRET_HEADER))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const plan = await getVoicePlan((await params).sessionId);
  if (!plan) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(plan, { headers: { "Cache-Control": "no-store" } });
}
