from __future__ import annotations

import pytest

from voice_agent.director import InterviewDirector
from voice_agent.plan import PlanError, VoicePlan, session_id_from_metadata

from .conftest import FakeClock, plan_json


def test_asks_questions_in_order_and_completes(plan):
    d = InterviewDirector(plan)
    assert d.begin().id == "q1"
    assert d.next_question().id == "q2"
    assert d.next_question().id == "q3"
    assert not d.is_complete()
    assert d.next_question() is None
    assert d.is_complete()
    assert d.progress_index() == 3
    # Asking again after the end stays complete and never wraps around.
    assert d.next_question() is None
    assert d.cursor == 3


def test_starts_at_current_index():
    d = InterviewDirector(VoicePlan.from_json(plan_json(currentIndex=2)))
    assert d.begin().id == "q3"
    assert d.next_question() is None
    assert d.is_complete()


def test_next_question_without_begin_does_not_skip_the_first(plan):
    d = InterviewDirector(plan)
    assert d.next_question().id == "q1"
    assert d.next_question().id == "q2"


def test_plan_already_finished():
    d = InterviewDirector(VoicePlan.from_json(plan_json(currentIndex=3)))
    assert d.begin() is None
    assert d.is_complete()
    assert d.next_question() is None


def test_follow_up_cap_per_question(plan):
    d = InterviewDirector(plan)
    d.begin()
    assert d.request_follow_up() is True
    assert d.request_follow_up() is False  # cap of 1 reached
    d.next_question()
    assert d.request_follow_up() is True  # resets for the next question
    assert d.request_follow_up() is False


def test_zero_follow_ups_allowed():
    d = InterviewDirector(VoicePlan.from_json(plan_json(maxFollowUpsPerQuestion=0)))
    d.begin()
    assert d.request_follow_up() is False


def test_no_follow_up_before_a_question_or_after_completion(plan):
    d = InterviewDirector(plan)
    assert d.request_follow_up() is False  # nothing asked yet
    d.begin()
    for _ in range(3):
        d.next_question()
    assert d.is_complete()
    assert d.request_follow_up() is False


def test_turns_are_tagged_with_question_and_follow_up(plan):
    clock = FakeClock()
    d = InterviewDirector(plan, now=clock.iso)
    d.begin()
    d.add_turn("ai", "Hi Asha! Tell me about a campaign you ran.")
    d.add_turn("student", "I ran a Diwali sale campaign.")
    d.request_follow_up()
    d.add_turn("ai", "What was the result?")
    d.add_turn("student", "Sales went up 20 percent.")
    d.next_question()
    d.add_turn("ai", "How would you grow our Instagram?")
    d.add_turn("student", "   ")  # blank: ignored
    assert [(t["role"], t["questionId"], t.get("followUp", False)) for t in d.transcript] == [
        ("ai", "q1", False),
        ("student", "q1", False),
        ("ai", "q1", True),
        ("student", "q1", True),
        ("ai", "q2", False),
    ]
    assert d.transcript[0]["at"] == "2026-11-12T10:00:01.000Z"


def test_closing_turns_belong_to_the_last_question(plan):
    d = InterviewDirector(plan)
    d.begin()
    for _ in range(3):
        d.next_question()
    turn = d.add_turn("ai", "Thank you, that's all.")
    assert turn["questionId"] == "q3"


@pytest.mark.parametrize(
    "overrides",
    [
        {"questions": []},
        {"questions": [{"id": "q1"}]},
        {"currentIndex": 9},
        {"currentIndex": -1},
        {"maxFollowUpsPerQuestion": "1"},
        {"sessionId": None},
    ],
)
def test_invalid_plans_are_rejected(overrides):
    with pytest.raises(PlanError):
        VoicePlan.from_json(plan_json(**overrides))


def test_session_id_from_metadata():
    assert session_id_from_metadata(None, '{"sessionId": "abc"}') == "abc"
    assert session_id_from_metadata('{"sessionId": "job"}', '{"sessionId": "room"}') == "job"
    assert session_id_from_metadata("not json", "{}") is None
