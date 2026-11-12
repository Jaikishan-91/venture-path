"""The question plan the Next.js app hands the agent (`VoicePlan` in src/lib/v2/types.ts)."""

from __future__ import annotations

import json
from dataclasses import dataclass


class PlanError(ValueError):
    """The plan payload is missing fields or has the wrong shape."""


@dataclass(frozen=True)
class PlanQuestion:
    id: str
    text: str


@dataclass(frozen=True)
class VoicePlan:
    session_id: str
    listing_title: str
    business_name: str
    student_first_name: str
    questions: tuple[PlanQuestion, ...]
    current_index: int
    max_follow_ups_per_question: int
    language: str

    @classmethod
    def from_json(cls, data: object) -> VoicePlan:
        if not isinstance(data, dict):
            raise PlanError("plan must be an object")

        def text(key: str) -> str:
            value = data.get(key)
            if not isinstance(value, str):
                raise PlanError(f"{key} must be a string")
            return value

        def integer(key: str) -> int:
            value = data.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                raise PlanError(f"{key} must be a non-negative integer")
            return value

        raw_questions = data.get("questions")
        if not isinstance(raw_questions, list) or not raw_questions:
            raise PlanError("questions must be a non-empty list")
        questions: list[PlanQuestion] = []
        for raw in raw_questions:
            if (
                not isinstance(raw, dict)
                or not isinstance(raw.get("id"), str)
                or not isinstance(raw.get("text"), str)
                or not raw["text"].strip()
            ):
                raise PlanError("each question needs an id and text")
            questions.append(PlanQuestion(id=raw["id"], text=raw["text"].strip()))

        current_index = integer("currentIndex")
        if current_index > len(questions):
            raise PlanError("currentIndex is past the end of the plan")

        return cls(
            session_id=text("sessionId"),
            listing_title=text("listingTitle"),
            business_name=text("businessName"),
            student_first_name=text("studentFirstName").strip() or "there",
            questions=tuple(questions),
            current_index=current_index,
            max_follow_ups_per_question=integer("maxFollowUpsPerQuestion"),
            language=text("language") or "en-IN",
        )


def session_id_from_metadata(*candidates: str | None) -> str | None:
    """First `sessionId` found in the given JSON metadata strings (`VoiceRoomMetadata`)."""
    for raw in candidates:
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        if isinstance(data, dict) and isinstance(data.get("sessionId"), str) and data["sessionId"]:
            return data["sessionId"]
    return None
