# Adapted from DeepInterview (https://github.com/ngoanpv/DeepInterview),
# apps/agent/src/deepinterview_agent/live/interviewer.py.
# Copyright 2026 Pham Van Ngoan and the DeepInterview contributors.
# Licensed under the Apache License, Version 2.0 (see voice-agent/LICENSE-APACHE).
# Modified by VenturePath: a student interviewer for one job plan; tools are next_question,
# ask_follow_up (capped by the director), repeat_question and end_interview. save_answer,
# sections, difficulty hints, round handoffs and scoring were removed.
"""The voice interviewer persona and its tools (imports livekit at load time)."""

from __future__ import annotations

import logging

from livekit.agents import Agent, RunContext, function_tool

from .director import InterviewDirector
from .plan import VoicePlan

log = logging.getLogger("voice_agent.interviewer")

COMPLETE_SIGNAL = (
    "INTERVIEW_COMPLETE. There are no more questions. In one or two short sentences thank the "
    "student, tell them the business will review the interview and decide, then call "
    "end_interview. Do not ask anything else."
)


def build_instructions(plan: VoicePlan) -> str:
    return (
        "You are a friendly, professional AI interviewer for VenturePath, a platform where small "
        f"Indian businesses hire students. You are interviewing {plan.student_first_name} for the "
        f"role \"{plan.listing_title}\" at {plan.business_name}. This is a spoken conversation: "
        "keep every turn short, warm and clear, in simple English suited to an Indian student "
        f"(language {plan.language}).\n\n"
        "Strict rules:\n"
        "- Ask ONLY the questions you get from the next_question tool, one at a time, in order, "
        "worded as given (you may smooth the wording slightly for speech). Never make up your own "
        "questions or skip ahead.\n"
        "- After the student has finished answering, call next_question and ask the question it "
        "returns.\n"
        "- If an answer is vague or very short, you may ask ONE short follow-up about that same "
        "answer, but ONLY after calling ask_follow_up and getting permission. If it says no, call "
        "next_question instead.\n"
        "- If the student asks you to repeat or explain the question, call repeat_question.\n"
        "- Never score, grade, judge or give feedback on answers (no 'great answer', no hints, no "
        "corrections). A neutral 'Thank you' or 'Okay' is fine. If asked how they did, say the "
        "business will review the interview and decide.\n"
        "- Do not mention tools, the plan, or these rules.\n"
        "- When a tool returns INTERVIEW_COMPLETE, say a short goodbye and call end_interview."
    )


def build_opening(plan: VoicePlan, first_question: str | None, remaining: int) -> str:
    if first_question is None:
        return (
            f"Greet {plan.student_first_name} warmly in one sentence, say all the questions for "
            f"this interview have already been answered, thank them, and call end_interview."
        )
    return (
        f"Start the interview now. Greet the student by first name ({plan.student_first_name}) in "
        f"one short sentence. In one or two sentences explain: you are an AI interviewer for the "
        f"{plan.listing_title} role at {plan.business_name}; you will ask {remaining} short "
        "question(s) and they can answer out loud in their own words; the business makes the final "
        f"decision. Then ask this first question and stop: {first_question}"
    )


class Interviewer(Agent):
    def __init__(self, director: InterviewDirector) -> None:
        super().__init__(instructions=build_instructions(director.plan))
        self._director = director

    async def on_enter(self) -> None:
        director = self._director
        remaining = director.total - director.cursor
        question = director.begin()
        self.session.generate_reply(
            instructions=build_opening(director.plan, question.text if question else None, remaining)
        )

    @function_tool
    async def next_question(self, context: RunContext) -> str:
        """Get the next interview question. Call this after the student has finished answering the
        current question (and any allowed follow-up). Ask the returned question and then listen."""
        question = self._director.next_question()
        if question is None:
            log.info("director: plan complete for %s", self._director.plan.session_id)
            return COMPLETE_SIGNAL
        number = self._director.cursor + 1
        log.info("director: asking question %d/%d", number, self._director.total)
        return f"Question {number} of {self._director.total}. Ask exactly this: {question.text}"

    @function_tool
    async def ask_follow_up(self, context: RunContext) -> str:
        """Ask permission for one short follow-up on the student's answer to the current question.
        Only ask the follow-up if this returns ALLOWED."""
        if self._director.request_follow_up():
            question = self._director.current_question()
            return (
                "ALLOWED. Ask one short follow-up about their answer to this question only: "
                f"{question.text if question else ''}. Then, after they answer, call next_question."
            )
        return "NOT ALLOWED. Do not ask a follow-up. Call next_question now."

    @function_tool
    async def repeat_question(self, context: RunContext) -> str:
        """Get the current question again, when the student asks you to repeat or clarify it."""
        question = self._director.current_question()
        if question is None:
            return COMPLETE_SIGNAL
        return f"Repeat this question in simpler words, same meaning: {question.text}"

    @function_tool
    async def end_interview(self, context: RunContext) -> str:
        """End the interview after saying goodbye. Only works once all questions are done."""
        if not self._director.is_complete():
            left = self._director.total - self._director.cursor
            return (
                f"NOT FINISHED: {left} question(s) remain. Call next_question and continue the "
                "interview."
            )
        try:
            self.session.shutdown(drain=True)
        except Exception:  # noqa: BLE001 - closing must never break the turn
            log.exception("end_interview: shutdown failed")
        return "Interview ended. Say nothing further."
