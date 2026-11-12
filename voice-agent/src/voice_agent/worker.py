# Adapted from DeepInterview (https://github.com/ngoanpv/DeepInterview),
# apps/agent/src/deepinterview_agent/worker.py.
# Copyright 2026 Pham Van Ngoan and the DeepInterview contributors.
# Licensed under the Apache License, Version 2.0 (see voice-agent/LICENSE-APACHE).
# Modified by VenturePath: one Gemini Live realtime model instead of STT/LLM/TTS, the plan and
# transcript go through the VenturePath app's shared-secret endpoints, explicit dispatch as
# VOICE_AGENT_NAME; prep, scoring, tracing, coach and Supabase paths were removed.
"""LiveKit Agents worker entrypoint.

    VOICE_AGENT_ENV_FILE=../.env uv run python -m voice_agent.worker start
"""

from __future__ import annotations

import logging

from livekit.agents import (
    AgentServer,
    AgentSession,
    AutoSubscribe,
    CloseEvent,
    ConversationItemAddedEvent,
    JobContext,
    cli,
)
from livekit import rtc
from livekit.plugins import google

from .app_client import AppClient
from .config import VOICE_AGENT_NAME, Settings, load_env_file, load_settings
from .director import InterviewDirector
from .flusher import TranscriptFlusher
from .guard import SessionGuard
from .interviewer import Interviewer
from .plan import session_id_from_metadata

log = logging.getLogger("voice_agent.worker")

# Before AgentServer reads LIVEKIT_* (also runs in each spawned job process).
load_env_file()

ROLE_MAP = {"assistant": "ai", "user": "student"}


def wire_transcript_capture(session: AgentSession, director: InterviewDirector) -> None:
    """Record every committed turn (Gemini input/output transcription) against the plan."""

    @session.on("conversation_item_added")
    def _on_item(ev: ConversationItemAddedEvent) -> None:
        item = ev.item
        role = ROLE_MAP.get(getattr(item, "role", ""))
        text = getattr(item, "text_content", None)
        if role and text:
            director.add_turn(role, text)  # type: ignore[arg-type]
            log.info("turn: %s (%d chars), question %d/%d", role, len(text),
                     min(director.progress_index() + 1, director.total), director.total)


def build_model(settings: Settings, language: str) -> google.realtime.RealtimeModel:
    # Input and output transcription default to on in this plugin; they are passed explicitly
    # because the transcript (and so the report) depends on them.
    from google.genai import types

    return google.realtime.RealtimeModel(
        model=settings.live_model,
        api_version=settings.live_api_version,
        voice=settings.voice,
        language=language,
        temperature=0.6,
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )


server = AgentServer(
    # The final transcript POST retries for up to ~30 s; give shutdown room to finish it.
    shutdown_process_timeout=60.0,
    # Each job process imports google-genai, which takes >10 s on a cold start.
    initialize_process_timeout=60.0,
    # Interviews are rare and long; one warm process is enough (more load more slowly).
    num_idle_processes=1,
)


@server.rtc_session(agent_name=VOICE_AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    settings = load_settings()
    missing = settings.missing()
    if missing:
        log.error("voice agent misconfigured, missing: %s", ", ".join(missing))
        return

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    # Two quick joins can race into two dispatches; only one interviewer may run per room.
    if any(
        p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
        for p in ctx.room.remote_participants.values()
    ):
        log.warning("room %s already has an interviewer; leaving", ctx.room.name)
        ctx.shutdown("duplicate agent")
        return
    session_id = session_id_from_metadata(ctx.job.metadata, ctx.room.metadata)
    if not session_id:
        log.error("room %s has no sessionId in its metadata; leaving", ctx.room.name)
        ctx.shutdown("no session id")
        return

    client = AppClient(settings.app_url, settings.shared_secret)
    plan = await client.fetch_plan(session_id)
    if plan is None:
        log.error("no voice plan for session %s; leaving", session_id)
        await client.aclose()
        ctx.shutdown("no plan")
        return
    log.info("session %s: %d question(s), starting at %d", session_id, len(plan.questions),
             plan.current_index)

    director = InterviewDirector(plan)
    session = AgentSession(llm=build_model(settings, plan.language))
    wire_transcript_capture(session, director)

    flusher = TranscriptFlusher(director, client, interval_sec=settings.flush_interval_sec)
    guard = SessionGuard(
        session,
        director,
        max_duration_sec=settings.max_session_sec,
        end_grace_sec=settings.end_grace_sec,
    )

    @session.on("close")
    def _on_close(ev: CloseEvent) -> None:
        # Student left (PARTICIPANT_DISCONNECTED), end_interview/guard (USER_INITIATED) or an
        # error: end the job; the shutdown callback sends the final batch.
        log.info("session %s closed: %s%s", session_id, ev.reason.value,
                 f" ({type(ev.error).__name__})" if ev.error else "")
        ctx.shutdown(f"session closed: {ev.reason.value}")

    async def _on_shutdown() -> None:
        await guard.aclose()
        completed = director.is_complete()
        await flusher.finish(completed=completed)
        await client.aclose()

    ctx.add_shutdown_callback(_on_shutdown)

    await session.start(agent=Interviewer(director), room=ctx.room)
    guard.start()
    flusher.start()


def main() -> None:
    cli.run_app(server)


if __name__ == "__main__":
    main()
