"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { VoiceRoom } from "@/components/interview/voice-room";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StudentInterviewView } from "@/lib/ai-interview";
import {
  INTERVIEW_QUESTION_COUNT,
  INTERVIEW_TARGET_MINUTES,
  MAX_INTERVIEW_ANSWER_LENGTH,
} from "@/lib/v2/types";
import {
  startInterviewAction,
  submitAnswerAction,
  switchToChatAction,
  type InterviewActionState,
} from "./actions";

type ChatView = Extract<StudentInterviewView, { state: "chat" | "voice" }>;

export function InterviewClient({
  token,
  initialView,
}: {
  token: string;
  initialView: StudentInterviewView;
}) {
  const [view, setView] = useState(initialView);
  const [pending, startTransition] = useTransition();

  const apply = (state: InterviewActionState) => {
    setView(state.view);
    if (state.error) toast.error(state.error);
  };
  const runAction = (action: () => Promise<InterviewActionState>) =>
    startTransition(async () => apply(await action()));

  switch (view.state) {
    case "not_found":
      return (
        <CardHeader>
          <CardTitle>Interview link not valid</CardTitle>
          <CardDescription>
            Check that you opened the whole link from your email, and that you are signed in with
            the account you applied with.
          </CardDescription>
        </CardHeader>
      );
    case "expired":
      return (
        <CardHeader>
          <CardTitle>This interview is closed</CardTitle>
          <CardDescription>
            The link for {view.listingTitle} at {view.businessName} has expired or is no longer
            active. Contact the business if you think this is a mistake.
          </CardDescription>
        </CardHeader>
      );
    case "done":
      return (
        <CardHeader>
          <CardTitle>Submitted ✓</CardTitle>
          <CardDescription>
            Thank you. Your answers for {view.listingTitle} were sent to {view.businessName}. They
            make the final decision and will contact you.
          </CardDescription>
        </CardHeader>
      );
    case "intro":
      return (
        <Intro
          view={view}
          pending={pending}
          onStart={(mode) => runAction(() => startInterviewAction(token, { mode, consent: true }))}
        />
      );
    case "voice":
      return (
        <>
          <Header view={view} />
          <CardContent>
            <VoiceRoom
              token={token}
              onSwitchToChat={() => runAction(() => switchToChatAction(token))}
            />
          </CardContent>
        </>
      );
    case "chat":
      return <Chat token={token} view={view} pending={pending} runAction={runAction} />;
  }
}

function Header({ view }: { view: ChatView }) {
  const shown = Math.min(view.currentIndex + 1, view.questionCount);
  return (
    <CardHeader>
      <CardTitle>{view.listingTitle}</CardTitle>
      <CardDescription>
        {view.businessName} · Question {shown} of {view.questionCount}
      </CardDescription>
    </CardHeader>
  );
}

function Intro({
  view,
  pending,
  onStart,
}: {
  view: Extract<StudentInterviewView, { state: "intro" }>;
  pending: boolean;
  onStart: (mode: "chat" | "voice") => void;
}) {
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <CardHeader>
        <CardTitle>AI interview: {view.listingTitle}</CardTitle>
        <CardDescription>{view.businessName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p>
          An AI will ask you {INTERVIEW_QUESTION_COUNT} questions about this role (~15 min). The
          business makes the final decision.
        </p>
        <p className="text-muted-foreground">
          You have one attempt. Answer in your own words; try to finish within{" "}
          {INTERVIEW_TARGET_MINUTES} minutes.
        </p>
        {view.voiceEnabled && (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 font-medium">How do you want to answer?</legend>
            {(["chat", "voice"] as const).map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${mode === option ? "border-foreground" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => setMode(option)}
                />
                {option === "chat" ? "💬 Chat" : "🎤 Voice"}
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            I agree that an AI asks me questions and that my answers
            {view.voiceEnabled
              ? " (typed, or a text transcript of what I say — audio is not stored)"
              : ""}{" "}
            are shared with {view.businessName}. Pasting answers and leaving this tab are noted.
          </span>
        </label>
        <Button
          type="button"
          className="self-start"
          disabled={!agreed || pending}
          onClick={() => onStart(view.voiceEnabled ? mode : "chat")}
        >
          {pending ? "Starting…" : "I agree, start"}
        </Button>
      </CardContent>
    </>
  );
}

function Chat({
  token,
  view,
  pending,
  runAction,
}: {
  token: string;
  view: ChatView;
  pending: boolean;
  runAction: (action: () => Promise<InterviewActionState>) => void;
}) {
  const [text, setText] = useState("");
  const pasted = useRef(false);
  const tabLeaves = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Integrity log (from aural-oss): count tab leaves; sent with the next answer.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tabLeaves.current += 1;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [view.transcript.length, pending]);

  const submit = () => {
    if (!text.trim() || pending) return;
    const input = {
      text,
      expectedIndex: view.currentIndex,
      expectedTurns: view.transcript.length,
      pasted: pasted.current,
      tabLeaves: tabLeaves.current,
    };
    runAction(async () => {
      const state = await submitAnswerAction(token, input);
      if (!state.error) {
        setText("");
        pasted.current = false;
        tabLeaves.current = 0;
      }
      return state;
    });
  };

  return (
    <>
      <Header view={view} />
      <CardContent className="flex flex-col gap-4 text-sm">
        <ol className="flex flex-col gap-3" aria-live="polite">
          {view.transcript.map((turn, index) => (
            <li
              key={index}
              className={
                turn.role === "ai"
                  ? "max-w-[90%] rounded-2xl rounded-tl-sm bg-[#eef0f4] px-3 py-2"
                  : "ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[#1f4138] px-3 py-2 whitespace-pre-line text-[#f4eddd]"
              }
            >
              {turn.text}
            </li>
          ))}
          {pending && (
            <li className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[#eef0f4] px-3 py-2 text-muted-foreground">
              thinking…
            </li>
          )}
        </ol>
        <div ref={endRef} />
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label htmlFor="answer">Your answer</Label>
          <Textarea
            id="answer"
            rows={5}
            value={text}
            maxLength={MAX_INTERVIEW_ANSWER_LENGTH}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
            onPaste={() => {
              pasted.current = true;
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {text.length}/{MAX_INTERVIEW_ANSWER_LENGTH}
            </span>
            <Button type="submit" disabled={pending || !text.trim()}>
              {pending ? "Sending…" : "Send answer"}
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );
}
