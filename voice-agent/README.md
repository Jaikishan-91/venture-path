# VenturePath voice agent

The voice mode of the AI interview (docs/PRODUCT.md, Module 5). A [LiveKit Agents](https://docs.livekit.io/agents/)
worker that runs a **Gemini Live** speech-to-speech session as the interviewer. Its live loop is adapted
from [DeepInterview](https://github.com/ngoanpv/DeepInterview) (Apache-2.0; see `NOTICE`).

The agent only *speaks* the plan; the Next.js app makes the plan and writes the report.

```text
browser ──POST /api/interview/[token]/livekit-token──► app: creates room vp-interview-<sessionId>
   │                                                   (metadata {sessionId}), dispatches
   │                                                   "venturepath-interviewer", returns a mic-only token
   └──── audio (LiveKit) ────► voice agent ──GET  /api/voice-agent/sessions/<id>/plan──────► app
                                           ──POST /api/voice-agent/sessions/<id>/transcript─► app
                                             (header x-voice-agent-secret)
```

## How it stays on the plan

- `director.py` holds the cursor. The greeting includes the question at `currentIndex`; after that the
  model gets each question only from the `next_question` tool, in order. It can't skip or invent.
- A follow-up needs `ask_follow_up` to return ALLOWED: at most `maxFollowUpsPerQuestion` per question.
  Follow-up turns are sent with `followUp: true`.
- `end_interview` only works after the last question. `guard.py` ends the session at the time limit
  (25 min) and closes a finished interview if the model never says goodbye.
- The instructions forbid scoring or feedback; the model never sees a rubric.

## Transcript delivery

Gemini Live's input/output transcription is captured per committed turn. `flusher.py` POSTs new
turns every 15 s as `VoiceTranscriptPost` batches (`seq` 0, 1, 2…), with retry and backoff. When the
session ends it sends the final batch: `completed: true` after the last question, otherwise
`completed: false` (student left, time limit, error), so chat can continue from `currentIndex`. A final
batch that can't be delivered is logged at CRITICAL. The app de-duplicates turns, so retries are safe.
Transcript text is never logged.

## Configuration

| Variable | Default | |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | — | LiveKit server (`--dev`: `ws://localhost:7880`, `devkey`, `secret`) |
| `GOOGLE_API_KEY` | — | Gemini API key |
| `VOICE_LIVE_MODEL` | `gemini-3.8-live` | Gemini Live model |
| `VOICE_LIVE_API_VERSION` | `v1alpha` | Live API version. The SDK default (`v1beta`) answered 404 for this key on 2026-11-12 |
| `VOICE_LIVE_VOICE` | `Puck` | Gemini voice |
| `VOICE_AGENT_APP_URL` | `http://localhost:3000` | Where the app runs |
| `VOICE_AGENT_SHARED_SECRET` | — | Same value as the app's |
| `VOICE_MAX_SESSION_SEC` | `1500` | Hard session limit |
| `VOICE_FLUSH_INTERVAL_SEC` | `15` | Checkpoint interval |
| `VOICE_AGENT_ENV_FILE` | — | Optional env file to load (e.g. the app's `.env`); real env vars win |

The app also needs `VOICE_INTERVIEW_ENABLED=true` and the same `LIVEKIT_*` and
`VOICE_AGENT_SHARED_SECRET` values (see `.env.example`).

## Run locally

From the repository root, with the app on port 3000 (`npm run dev`):

```bash
# Option A: LiveKit and the agent in Docker
docker compose --profile voice up -d          # livekit + voice-agent (agent calls host.docker.internal:3000)

# Option B: LiveKit in Docker, agent on the host with uv
docker compose --profile voice up -d livekit
cd voice-agent
uv sync
VOICE_AGENT_ENV_FILE=../.env uv run python -m voice_agent.worker start
```

The worker logs `registered worker` with `agent_name: venturepath-interviewer`. It is dispatched
explicitly, so it never joins rooms on its own.

The `voice-agent` container shares the `livekit` container's network namespace, because the dev
server advertises `127.0.0.1` for media. Set `VOICE_AGENT_DOCKER_APP_URL` if the app isn't at
`http://host.docker.internal:3000`.

## Tests

```bash
cd voice-agent && uv run pytest
```

The director (question order, start index, follow-up cap, completion, turn tags), the guard (time
limit, end grace) and the flusher/HTTP client (seq, retries, final batch, 4xx handling) are tested with
a mocked plan and `httpx.MockTransport`. The tests make no network calls.
