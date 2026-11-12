# Adapted from DeepInterview (https://github.com/ngoanpv/DeepInterview),
# apps/agent/src/deepinterview_agent/live/flusher.py.
# Copyright 2026 Pham Van Ngoan and the DeepInterview contributors.
# Licensed under the Apache License, Version 2.0 (see voice-agent/LICENSE-APACHE).
# Modified by VenturePath: sends only new turns as numbered `VoiceTranscriptPost` batches, retries
# with backoff, and owns the final (completed) batch so checkpoints never race it.
"""Transcript checkpoints: the app receives the interview as it happens.

Every ``interval_sec`` the flusher POSTs turns the app hasn't acknowledged yet.
``finish()`` stops the timer, waits for any in-flight checkpoint, then sends the
final batch with ``completed`` set. A crash loses at most one interval. A final
batch that can't be delivered is logged at CRITICAL with its size, never dropped
silently.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from .app_client import AppClient, PostRejected
from .director import InterviewDirector

log = logging.getLogger("voice_agent.flusher")

CHECKPOINT_ATTEMPTS = 3
FINAL_ATTEMPTS = 6


class TranscriptFlusher:
    def __init__(
        self,
        director: InterviewDirector,
        client: AppClient,
        *,
        interval_sec: float = 15.0,
    ) -> None:
        self._director = director
        self._client = client
        self._interval = float(interval_sec)
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        #: Turns the app has acknowledged.
        self.sent = 0
        #: Next batch number (monotonic per session, starting at 0).
        self.seq = 0
        self.finished = False
        #: Last index reported to the app; a change is worth a checkpoint even without new turns.
        self._sent_index: int | None = None

    def start(self) -> None:
        if self._interval > 0 and self._task is None:
            self._task = asyncio.create_task(self._run())

    async def _stop_timer(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    def _body(self, completed: bool) -> tuple[dict, int]:
        turns = list(self._director.transcript[self.sent :])
        body = {
            "seq": self.seq,
            "turns": turns,
            "currentIndex": self._director.progress_index(),
            "completed": completed,
        }
        return body, len(turns)

    async def _send(self, completed: bool, attempts: int) -> None:
        body, count = self._body(completed)
        await self._client.post_transcript(self._director.plan.session_id, body, attempts=attempts)
        self.sent += count
        self.seq += 1
        self._sent_index = body["currentIndex"]

    async def checkpoint(self) -> bool:
        """Send new turns if there are any. Failures are logged; turns are kept for next time."""
        async with self._lock:
            if self.finished:
                return False
            has_new = len(self._director.transcript) > self.sent
            if not has_new and self._sent_index == self._director.progress_index():
                return False
            try:
                await self._send(completed=False, attempts=CHECKPOINT_ATTEMPTS)
                return True
            except Exception as exc:
                log.warning("checkpoint for %s not delivered, will retry: %s",
                            self._director.plan.session_id, exc)
                return False

    async def finish(self, *, completed: bool) -> bool:
        """Send the final batch (idempotent). Returns True when the app acknowledged it."""
        await self._stop_timer()
        async with self._lock:
            if self.finished:
                return True
            try:
                await self._send(completed=completed, attempts=FINAL_ATTEMPTS)
            except PostRejected as exc:
                log.critical(
                    "FINAL TRANSCRIPT REJECTED for session %s (HTTP %d): %d unsent turn(s), "
                    "completed=%s",
                    self._director.plan.session_id, exc.status,
                    len(self._director.transcript) - self.sent, completed,
                )
                return False
            except Exception as exc:
                log.critical(
                    "FINAL TRANSCRIPT LOST for session %s after %d attempts: %d unsent turn(s), "
                    "completed=%s (%s)",
                    self._director.plan.session_id, FINAL_ATTEMPTS,
                    len(self._director.transcript) - self.sent, completed, exc,
                )
                return False
            self.finished = True
            log.info("final transcript sent for %s (%d turns, completed=%s)",
                     self._director.plan.session_id, self.sent, completed)
            return True

    async def _run(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._interval)
                await self.checkpoint()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("flusher: loop error (ignored)")
