import { findVoiceSessionForStudent, isVoiceInterviewEnabled } from "@/lib/ai-interview-voice";
import { getSession } from "@/lib/authz";
import { getLogger } from "@/lib/logger";
import { createVoiceJoin, getLiveKitConfig } from "@/lib/voice-livekit";

/**
 * Student browser → app: join details for the voice interview room (VoiceJoin). The student must
 * be signed in as the applicant; the session must be in progress in voice mode, with consent, and
 * not expired. 404 when voice is off, so the page simply offers chat.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isVoiceInterviewEnabled()) return Response.json({ error: "not_found" }, { status: 404 });
  const config = getLiveKitConfig();
  if (!config) return Response.json({ error: "not_found" }, { status: 404 });

  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "user") return Response.json({ error: "not_found" }, { status: 404 });

  const target = await findVoiceSessionForStudent((await params).token, session.user.id);
  if (!target.ok) {
    const status = target.reason === "not_found" ? 404 : 409;
    return Response.json({ error: target.reason }, { status });
  }

  try {
    const join = await createVoiceJoin(config, target.sessionId, `student-${session.user.id}`);
    return Response.json(join, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    getLogger().error(
      { err: error, sessionId: target.sessionId },
      "voice interview: LiveKit room or dispatch failed",
    );
    return Response.json({ error: "voice_unavailable" }, { status: 503 });
  }
}
