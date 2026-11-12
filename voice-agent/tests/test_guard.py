from __future__ import annotations

import asyncio

from voice_agent.director import InterviewDirector
from voice_agent.guard import WRAP_UP_INSTRUCTIONS, SessionGuard

from .conftest import FakeClock


class FakeSession:
    def __init__(self) -> None:
        self.replies: list[str] = []
        self.shutdowns: list[bool] = []

    def generate_reply(self, *, instructions: str) -> None:
        self.replies.append(instructions)

    def shutdown(self, *, drain: bool = True) -> None:
        self.shutdowns.append(drain)


async def _no_sleep(_seconds: float) -> None:
    await asyncio.sleep(0)


def make_guard(plan, clock, session=None, **kw):
    session = session or FakeSession()
    d = InterviewDirector(plan)
    guard = SessionGuard(
        session, d, max_duration_sec=kw.get("max_duration", 1500), end_grace_sec=30,
        time_fn=clock, sleep=_no_sleep,
    )
    return guard, d, session


def test_check_max_duration(plan):
    clock = FakeClock()
    guard, _, _ = make_guard(plan, clock)
    guard._started_at = 0.0
    clock.t = 1499
    assert guard.check() is None
    clock.t = 1500
    assert guard.check() == "max_duration"


def test_check_end_grace_after_completion(plan):
    clock = FakeClock()
    guard, d, _ = make_guard(plan, clock)
    guard._started_at = 0.0
    d.begin()
    for _ in range(3):
        d.next_question()
    clock.t = 100
    assert guard.check() is None  # completion noticed now
    clock.t = 129
    assert guard.check() is None
    clock.t = 130
    assert guard.check() == "end_grace"


async def test_run_wraps_up_and_shuts_down_at_max_duration(plan):
    clock = FakeClock()
    guard, _, session = make_guard(plan, clock, max_duration=10)
    guard.start()
    clock.t = 10
    for _ in range(20):
        await asyncio.sleep(0)
        if session.shutdowns:
            break
    await guard.aclose()
    assert guard.tripped == "max_duration"
    assert session.replies == [WRAP_UP_INSTRUCTIONS]
    assert session.shutdowns == [True]
