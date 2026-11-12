import "server-only";
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import {
  VOICE_AGENT_NAME,
  voiceRoomName,
  type VoiceJoin,
  type VoiceRoomMetadata,
} from "./v2/types";

/** LiveKit side of the voice interview (WP-D). Server-only; reads LIVEKIT_* from the env. */

/** Student join tokens are short-lived: enough to connect, not to be reused later. */
const PARTICIPANT_TOKEN_TTL = "10m";
/** Keep an empty room briefly so a reload can rejoin; LiveKit closes it after. */
const ROOM_EMPTY_TIMEOUT_SEC = 120;
const ROOM_DEPARTURE_TIMEOUT_SEC = 30;
// JobStatus from @livekit/protocol (not re-exported by livekit-server-sdk): 0 pending, 1 running.
const ACTIVE_JOB_STATUSES = new Set([0, 1]);

type LiveKitConfig = { wsUrl: string; publicUrl: string; apiKey: string; apiSecret: string };

export function getLiveKitConfig(): LiveKitConfig | null {
  const wsUrl = process.env.LIVEKIT_URL ?? "";
  const apiKey = process.env.LIVEKIT_API_KEY ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? "";
  if (!wsUrl || !apiKey || !apiSecret) return null;
  return { wsUrl, publicUrl: process.env.LIVEKIT_PUBLIC_URL || wsUrl, apiKey, apiSecret };
}

/** The server APIs speak HTTP on the same host as the WebSocket URL. */
const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws(s?):\/\//, "http$1://");

/**
 * Creates (or reuses) the session's room with its metadata and makes sure exactly one
 * interviewer agent is dispatched to it, then mints the student's token (microphone only).
 */
export async function createVoiceJoin(
  config: LiveKitConfig,
  sessionId: string,
  identity: string,
): Promise<VoiceJoin> {
  const roomName = voiceRoomName(sessionId);
  const metadata = JSON.stringify({ sessionId } satisfies VoiceRoomMetadata);
  const host = httpUrl(config.wsUrl);

  const rooms = new RoomServiceClient(host, config.apiKey, config.apiSecret);
  // CreateRoom returns the existing room when it already exists.
  await rooms.createRoom({
    name: roomName,
    metadata,
    emptyTimeout: ROOM_EMPTY_TIMEOUT_SEC,
    departureTimeout: ROOM_DEPARTURE_TIMEOUT_SEC,
    // Student + interviewer, plus room for a replacement agent while an old job leaves.
    maxParticipants: 3,
  });

  const dispatches = new AgentDispatchClient(host, config.apiKey, config.apiSecret);
  const existing = await dispatches.listDispatch(roomName);
  const active = existing.some(
    (d) =>
      d.agentName === VOICE_AGENT_NAME &&
      // A dispatch without jobs yet is still waiting for a worker.
      (!d.state?.jobs.length ||
        d.state.jobs.some((job) => ACTIVE_JOB_STATUSES.has(job.state?.status ?? 0))),
  );
  if (!active) await dispatches.createDispatch(roomName, VOICE_AGENT_NAME, { metadata });

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    ttl: PARTICIPANT_TOKEN_TTL,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canSubscribe: true,
  });
  return { url: config.publicUrl, token: await token.toJwt(), roomName };
}
