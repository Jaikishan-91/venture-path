"""HTTP client for the VenturePath app's voice-agent endpoints (shared-secret auth)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from urllib.parse import quote

import httpx

from .config import VOICE_AGENT_SECRET_HEADER
from .plan import PlanError, VoicePlan

log = logging.getLogger("voice_agent.app_client")


class PostRejected(Exception):
    """The app answered 4xx: retrying the same body cannot succeed."""

    def __init__(self, status: int) -> None:
        super().__init__(f"app rejected the transcript with HTTP {status}")
        self.status = status


class AppClient:
    def __init__(
        self,
        base_url: str,
        shared_secret: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 10.0,
        sleep: Callable[[float], Awaitable[object]] = asyncio.sleep,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={VOICE_AGENT_SECRET_HEADER: shared_secret},
            timeout=timeout,
            transport=transport,
        )
        self._sleep = sleep

    async def aclose(self) -> None:
        await self._client.aclose()

    @staticmethod
    def _path(session_id: str, leaf: str) -> str:
        return f"/api/voice-agent/sessions/{quote(session_id, safe='')}/{leaf}"

    async def fetch_plan(self, session_id: str, *, attempts: int = 3) -> VoicePlan | None:
        """The plan, or None when the app says the session isn't a live voice session (404)."""
        for attempt in range(1, attempts + 1):
            try:
                resp = await self._client.get(self._path(session_id, "plan"))
            except httpx.HTTPError as exc:
                log.warning("plan fetch failed (attempt %d/%d): %s", attempt, attempts, type(exc).__name__)
            else:
                if resp.status_code == 200:
                    try:
                        return VoicePlan.from_json(resp.json())
                    except (PlanError, ValueError) as exc:
                        log.error("plan for %s is invalid: %s", session_id, exc)
                        return None
                if resp.status_code < 500:
                    log.error("plan fetch for %s -> HTTP %d", session_id, resp.status_code)
                    return None
                log.warning("plan fetch -> HTTP %d (attempt %d/%d)", resp.status_code, attempt, attempts)
            if attempt < attempts:
                await self._sleep(2 ** (attempt - 1))
        return None

    async def post_transcript(
        self,
        session_id: str,
        body: dict,
        *,
        attempts: int,
        base_delay: float = 1.0,
        max_delay: float = 15.0,
    ) -> None:
        """POST one `VoiceTranscriptPost`, retrying network errors and 5xx with backoff.

        Raises PostRejected on 4xx and the last error once attempts run out.
        """
        last: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                resp = await self._client.post(self._path(session_id, "transcript"), json=body)
            except httpx.HTTPError as exc:
                last = exc
                log.warning(
                    "transcript POST seq=%s failed (attempt %d/%d): %s",
                    body.get("seq"), attempt, attempts, type(exc).__name__,
                )
            else:
                if resp.is_success:
                    return
                if resp.status_code < 500:
                    raise PostRejected(resp.status_code)
                last = httpx.HTTPStatusError(
                    f"HTTP {resp.status_code}", request=resp.request, response=resp
                )
                log.warning(
                    "transcript POST seq=%s -> HTTP %d (attempt %d/%d)",
                    body.get("seq"), resp.status_code, attempt, attempts,
                )
            if attempt < attempts:
                await self._sleep(min(max_delay, base_delay * 2 ** (attempt - 1)))
        assert last is not None
        raise last
