# Adapted from DeepInterview (https://github.com/ngoanpv/DeepInterview),
# apps/agent/src/deepinterview_agent/live/state.py and live/director.py.
# Copyright 2026 Pham Van Ngoan and the DeepInterview contributors.
# Licensed under the Apache License, Version 2.0 (see voice-agent/LICENSE-APACHE).
# Modified by VenturePath: the plan comes from the VenturePath app, the cursor starts at the plan's
# currentIndex, the follow-up cap is enforced here, and turns use VenturePath's TranscriptTurn shape.
# Sections, difficulty hints, answer records and scoring were removed.
"""Pure, livekit-free state machine for one voice interview.

The model never chooses questions. It receives the current plan question from
:meth:`InterviewDirector.next_question` (called through the ``next_question``
tool) and may ask a follow-up only when :meth:`InterviewDirector.request_follow_up`
allows it. Nothing here reads the clock except through an injectable ``now``
function, so tests are deterministic.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from .plan import PlanQuestion, VoicePlan

Role = Literal["ai", "student"]


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class InterviewDirector:
    plan: VoicePlan
    now: Callable[[], str] = utc_now_iso
    #: Index of the question being asked (== len(questions) once complete).
    cursor: int = field(init=False)
    #: Whether the question at the cursor has been handed to the model yet.
    asked: bool = field(init=False, default=False)
    follow_ups_used: int = field(init=False, default=0)
    #: True between an allowed follow-up and the next question: turns are tagged followUp.
    in_follow_up: bool = field(init=False, default=False)
    #: Turns in `TranscriptTurn` shape (camelCase keys), in order.
    transcript: list[dict] = field(init=False, default_factory=list)

    def __post_init__(self) -> None:
        self.cursor = self.plan.current_index

    # --- questions -----------------------------------------------------------------------

    @property
    def total(self) -> int:
        return len(self.plan.questions)

    def is_complete(self) -> bool:
        return self.cursor >= self.total

    def current_question(self) -> PlanQuestion | None:
        if 0 <= self.cursor < self.total:
            return self.plan.questions[self.cursor]
        return None

    def begin(self) -> PlanQuestion | None:
        """The first question to ask (the one at currentIndex); marks it as asked."""
        question = self.current_question()
        if question is not None:
            self.asked = True
        return question

    def next_question(self) -> PlanQuestion | None:
        """Move on and return the question to ask now, or ``None`` when the plan is done.

        If the current question was never handed out (e.g. the greeting didn't include it), it is
        returned without advancing, so no plan question is ever skipped.
        """
        if self.is_complete():
            return None
        if not self.asked:
            self.asked = True
            return self.current_question()
        self.cursor += 1
        self.follow_ups_used = 0
        self.in_follow_up = False
        if self.is_complete():
            self.asked = False
            return None
        self.asked = True
        return self.current_question()

    # --- follow-up guard -----------------------------------------------------------------

    def follow_ups_left(self) -> int:
        return max(0, self.plan.max_follow_ups_per_question - self.follow_ups_used)

    def request_follow_up(self) -> bool:
        """Allow one follow-up on the current question if the cap isn't reached."""
        if self.is_complete() or not self.asked or self.follow_ups_left() == 0:
            return False
        self.follow_ups_used += 1
        self.in_follow_up = True
        return True

    # --- transcript ----------------------------------------------------------------------

    def _turn_question_id(self) -> str:
        question = self.current_question()
        if question is not None:
            return question.id
        # Closing words after the last question belong to the last question.
        return self.plan.questions[-1].id

    def add_turn(self, role: Role, text: str) -> dict | None:
        """Record a spoken turn tagged with the current question; blank text is ignored."""
        text = (text or "").strip()
        if not text:
            return None
        turn: dict = {
            "role": role,
            "text": text,
            "questionId": self._turn_question_id(),
            "at": self.now(),
        }
        if self.in_follow_up:
            turn["followUp"] = True
        self.transcript.append(turn)
        return turn

    def progress_index(self) -> int:
        """`currentIndex` to report: the question in progress, or the plan length when done."""
        return min(self.cursor, self.total)
