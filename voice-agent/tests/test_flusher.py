from __future__ import annotations

import json
import logging

import httpx
import pytest

from voice_agent.app_client import AppClient, PostRejected
from voice_agent.config import VOICE_AGENT_SECRET_HEADER
from voice_agent.director import InterviewDirector
from voice_agent.flusher import FINAL_ATTEMPTS, TranscriptFlusher

from .conftest import plan_json


class FakeApp:
    """Mock transport for the app's voice-agent endpoints; no network."""

    def __init__(self, plan: dict | None = None) -> None:
        self.plan = plan if plan is not None else plan_json()
        self.posts: list[dict] = []
        self.headers: list[str | None] = []
        #: Status codes to answer with before succeeding (consumed in order).
        self.failures: list[int | Exception] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.headers.append(request.headers.get(VOICE_AGENT_SECRET_HEADER))
        if self.failures:
            failure = self.failures.pop(0)
            if isinstance(failure, Exception):
                raise failure
            return httpx.Response(failure)
        if request.method == "GET" and request.url.path.endswith("/plan"):
            return httpx.Response(200, json=self.plan)
        if request.method == "POST" and request.url.path.endswith("/transcript"):
            self.posts.append(json.loads(request.content))
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)


async def _no_sleep(_s: float) -> None:
    return None


def make(app: FakeApp):
    client = AppClient("http://app.test", "s3cret", transport=httpx.MockTransport(app.handler),
                       sleep=_no_sleep)
    return client


async def test_fetch_plan_sends_secret_and_parses():
    app = FakeApp()
    client = make(app)
    plan = await client.fetch_plan("sess-1")
    assert plan is not None and plan.student_first_name == "Asha"
    assert app.headers == ["s3cret"]


async def test_fetch_plan_404_and_retry_on_500():
    app = FakeApp()
    app.failures = [404]
    assert await make(app).fetch_plan("sess-1") is None
    app.failures = [503, httpx.ConnectError("down")]
    assert (await make(app).fetch_plan("sess-1")) is not None


async def test_checkpoints_send_only_new_turns_with_monotonic_seq():
    app = FakeApp()
    client = make(app)
    d = InterviewDirector((await client.fetch_plan("sess-1")))
    f = TranscriptFlusher(d, client, interval_sec=0)
    d.begin()
    d.add_turn("ai", "Q1?")
    assert await f.checkpoint() is True
    assert await f.checkpoint() is False  # nothing new
    d.add_turn("student", "A1")
    d.next_question()
    d.add_turn("ai", "Q2?")
    assert await f.checkpoint() is True
    assert [p["seq"] for p in app.posts] == [0, 1]
    assert [len(p["turns"]) for p in app.posts] == [1, 2]
    assert app.posts[1]["currentIndex"] == 1
    assert all(p["completed"] is False for p in app.posts)


async def test_failed_checkpoint_keeps_turns_for_next_batch():
    app = FakeApp()
    client = make(app)
    d = InterviewDirector((await client.fetch_plan("sess-1")))
    f = TranscriptFlusher(d, client, interval_sec=0)
    d.begin()
    d.add_turn("ai", "Q1?")
    app.failures = [500, 500, 500]
    assert await f.checkpoint() is False
    d.add_turn("student", "A1")
    assert await f.checkpoint() is True
    assert app.posts[0]["seq"] == 0
    assert [t["text"] for t in app.posts[0]["turns"]] == ["Q1?", "A1"]


async def test_final_batch_completed_after_last_question():
    app = FakeApp()
    client = make(app)
    d = InterviewDirector((await client.fetch_plan("sess-1")))
    f = TranscriptFlusher(d, client, interval_sec=0)
    d.begin()
    d.add_turn("ai", "Q1?")
    await f.checkpoint()
    for _ in range(3):
        d.next_question()
    d.add_turn("ai", "Thank you, bye.")
    app.failures = [502, httpx.ReadTimeout("slow")]  # retried
    assert await f.finish(completed=d.is_complete()) is True
    final = app.posts[-1]
    assert final == {
        "seq": 1,
        "turns": [d.transcript[1]],
        "currentIndex": 3,
        "completed": True,
    }
    # Idempotent: a second finish doesn't post again; checkpoints stop.
    assert await f.finish(completed=True) is True
    assert await f.checkpoint() is False
    assert len(app.posts) == 2


async def test_final_batch_on_disconnect_is_not_completed():
    app = FakeApp()
    client = make(app)
    d = InterviewDirector((await client.fetch_plan("sess-1")))
    f = TranscriptFlusher(d, client, interval_sec=0)
    d.begin()
    d.add_turn("ai", "Q1?")
    assert await f.finish(completed=d.is_complete()) is True
    assert app.posts[-1]["completed"] is False
    assert app.posts[-1]["currentIndex"] == 0


async def test_lost_final_batch_is_logged_loudly(caplog):
    app = FakeApp()
    client = make(app)
    d = InterviewDirector((await client.fetch_plan("sess-1")))
    f = TranscriptFlusher(d, client, interval_sec=0)
    d.begin()
    d.add_turn("ai", "Q1?")
    app.failures = [httpx.ConnectError("down")] * FINAL_ATTEMPTS
    with caplog.at_level(logging.CRITICAL):
        assert await f.finish(completed=False) is False
    assert "FINAL TRANSCRIPT LOST" in caplog.text
    assert "1 unsent turn" in caplog.text
    assert "Q1?" not in caplog.text  # transcript text is never logged


async def test_rejected_post_is_not_retried():
    app = FakeApp()
    client = make(app)
    app.failures = [401]
    with pytest.raises(PostRejected):
        await client.post_transcript("sess-1", {"seq": 0}, attempts=5)
    assert len(app.headers) == 1
