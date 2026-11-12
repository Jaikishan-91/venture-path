# Adapted from DeepInterview (https://github.com/ngoanpv/DeepInterview),
# apps/agent/src/deepinterview_agent/live/guard.py.
# Copyright 2026 Pham Van Ngoan and the DeepInterview contributors.
# Licensed under the Apache License, Version 2.0 (see voice-agent/LICENSE-APACHE).
# Modified by VenturePath: wraps up through the realtime model (no separate TTS), adds a grace
# timer that closes a finished interview if the model never calls end_interview, drops the turn cap.
"""In-room backstop for a voice interview; runs off the turn path.

Ends the session when the maximum length is reached, and closes a finished
interview whose goodbye never triggered ``end_interview``. ``session`` only needs
``generate_reply(instructions=...)`` and ``shutdown(drain=...)`` (the LiveKit
``AgentSession`` surface), so tests pass a fake session and a fake clock.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable

from .director import InterviewDirector

log = logging.getLogger("voice_agent.guard")

WRAP_UP_INSTRUCTIONS = (
    "We have reached the time limit. In one or two short sentences, politely tell the student "
    "that time is up, thank them, and say the business will review the interview. "
    "Do not ask anything else."
)


class SessionGuard:
    def __init__(
        self,
        session: object,
        director: InterviewDirector,
        *,
        max_duration_sec: float,
        end_grace_sec: float,
        interval_sec: float = 1.0,
        wrap_up_speech_sec: float = 12.0,
        time_fn: Callable[[], float] | None = None,
        sleep: Callable[[float], object] = asyncio.sleep,
    ) -> None:
        self._session = session
        self._director = director
        self._max_duration = float(max_duration_sec)
        self._end_grace = float(end_grace_sec)
        self._interval = interval_sec
        self._wrap_up_speech = wrap_up_speech_sec
        self._time = time_fn or time.monotonic
        self._sleep = sleep
        self._task: asyncio.Task[None] | None = None
        self._started_at = 0.0
        self._completed_at: float | None = None
        #: Why the guard ended the session ("max_duration" / "end_grace"), or None.
        self.tripped: str | None = None

    def start(self) -> None:
        if self._task is None:
            self._started_at = self._time()
            self._task = asyncio.create_task(self._run())

    async def aclose(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def check(self) -> str | None:
        """Return a reason when the session must end now (pure apart from the clock)."""
        now = self._time()
        if now - self._started_at >= self._max_duration:
            return "max_duration"
        if self._director.is_complete():
            if self._completed_at is None:
                self._completed_at = now
            elif now - self._completed_at >= self._end_grace:
                return "end_grace"
        return None

    async def _wrap_up(self, reason: str) -> None:
        log.warning("guard: ending session %s (%s)", self._director.plan.session_id, reason)
        if reason == "max_duration":
            with contextlib.suppress(Exception):
                self._session.generate_reply(instructions=WRAP_UP_INSTRUCTIONS)  # type: ignore[attr-defined]
                await self._sleep(self._wrap_up_speech)
        with contextlib.suppress(Exception):
            self._session.shutdown(drain=True)  # type: ignore[attr-defined]

    async def _run(self) -> None:
        try:
            while True:
                reason = self.check()
                if reason is not None:
                    self.tripped = reason
                    await self._wrap_up(reason)
                    return
                await self._sleep(self._interval)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("guard: watcher error (ignored)")
