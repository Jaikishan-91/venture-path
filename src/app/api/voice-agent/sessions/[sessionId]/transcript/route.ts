import { isValidVoiceAgentSecret, recordVoiceTranscript } from "@/lib/ai-interview-voice";
import {
  VOICE_AGENT_SECRET_HEADER,
  type InterviewFailure,
  type VoiceTranscriptPost,
} from "@/lib/v2/types";

const STATUS: Record<InterviewFailure, number> = {
  not_found: 404,
  invalid: 400,
  already_completed: 409,
  expired: 404,
  no_consent: 404,
  stale: 409,
};

/** Voice agent → app: append transcript turns; `completed: true` finishes the session. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isValidVoiceAgentSecret(request.headers.get(VOICE_AGENT_SECRET_HEADER))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const result = await recordVoiceTranscript((await params).sessionId, body as VoiceTranscriptPost);
  if (!result.ok) return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  return Response.json({ ok: true });
}
