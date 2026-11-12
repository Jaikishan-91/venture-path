from __future__ import annotations

import pytest

from voice_agent.plan import VoicePlan


def plan_json(**overrides) -> dict:
    data = {
        "sessionId": "sess-1",
        "listingTitle": "Marketing intern",
        "businessName": "Acme Foods",
        "studentFirstName": "Asha",
        "questions": [
            {"id": "q1", "text": "Tell me about a campaign you ran."},
            {"id": "q2", "text": "How would you grow our Instagram?"},
            {"id": "q3", "text": "When can you start?"},
        ],
        "currentIndex": 0,
        "maxFollowUpsPerQuestion": 1,
        "language": "en-IN",
    }
    data.update(overrides)
    return data


@pytest.fixture
def plan() -> VoicePlan:
    return VoicePlan.from_json(plan_json())


class FakeClock:
    def __init__(self) -> None:
        self.t = 0.0
        self.n = 0

    def __call__(self) -> float:
        return self.t

    def iso(self) -> str:
        self.n += 1
        return f"2026-11-12T10:00:{self.n:02d}.000Z"
