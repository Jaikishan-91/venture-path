"use client";

import { CheckCircle2, Clock, ListChecks, RotateCcw, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { InterviewFrame } from "@/components/interview/interview-frame";
import {
  InterviewStage,
  InterviewerOrb,
  TranscriptEntry,
  TranscriptPanel,
} from "@/components/interview/interview-stage";
import { MicCheck, type MicStatus } from "@/components/interview/mic-check";
import { VoiceRoom } from "@/components/interview/voice-room";
import { Button } from "@/components/ui/button";
import type { StudentInterviewView } from "@/lib/ai-interview";
import {
  browserStorage,
  clearDraft,
  isSendKey,
  loadDraft,
  questionNumber,
  saveDraft,
  showCharCount,
} from "@/lib/interview-room";
import { INTERVIEW_QUESTION_COUNT, MAX_INTERVIEW_ANSWER_LENGTH } from "@/lib/v2/types";
import {
  startInterviewAction,
  submitAnswerAction,
  switchToChatAction,
  type InterviewActionState,
} from "./actions";

type ChatView = Extract<StudentInterviewView, { state: "chat" | "voice" }>;
type IntroView = Extract<StudentInterviewView, { state: "intro" }>;

const SEND_FAILED =
  "We couldn't send your answer. Check your internet and try again — your answer is still here.";
const APPLICATIONS_HREF = "/user/applications";

export function InterviewClient({
  token,
  initialView,
}: {
  token: string;
  initialView: StudentInterviewView;
}) {
  const [view, setView] = useState(initialView);
  // A server refresh (e.g. after a voice interview ends) brings a new view.
  const [shownInitial, setShownInitial] = useState(initialView);
  if (shownInitial !== initialView) {
    setShownInitial(initialView);
    setView(initialView);
  }
  const [pending, startTransition] = useTransition();

  const runAction = (action: () => Promise<InterviewActionState>) =>
    startTransition(async () => {
      try {
        const state = await action();
        setView(state.view);
        if (state.error) toast.error(state.error);
      } catch {
        toast.error("Something went wrong. Check your internet and try again.");
      }
    });

  switch (view.state) {
    case "not_found":
      return (
        <InterviewFrame>
          <Message title="This interview link isn't valid">
            Check that you opened the whole link from your email, and that you are signed in with
            the account you applied with. If you opened the interview from My Applications before,
            the emailed link was replaced: continue from{" "}
            <a href="/user/applications" className="underline">
              My Applications
            </a>
            .
          </Message>
        </InterviewFrame>
      );
    case "expired":
      return (
        <InterviewFrame businessName={view.businessName} listingTitle={view.listingTitle}>
          <Message title="This interview is closed">
            The link for {view.listingTitle} at {view.businessName} has expired or is no longer
            active. Contact the business if you think this is a mistake.
          </Message>
        </InterviewFrame>
      );
    case "done":
      return (
        <InterviewFrame businessName={view.businessName} listingTitle={view.listingTitle}>
          <Finished businessName={view.businessName} />
        </InterviewFrame>
      );
    case "intro":
      return (
        <InterviewFrame businessName={view.businessName} listingTitle={view.listingTitle}>
          <Intro
            view={view}
            pending={pending}
            onStart={(mode) =>
              runAction(() => startInterviewAction(token, { mode, consent: true }))
            }
          />
        </InterviewFrame>
      );
    case "voice":
      return (
        <InterviewFrame businessName={view.businessName} listingTitle={view.listingTitle} wide>
          <VoiceRoom
            token={token}
            businessName={view.businessName}
            listingTitle={view.listingTitle}
            current={questionNumber(view.currentIndex, view.questionCount)}
            total={view.questionCount}
            onSwitchToChat={() => runAction(() => switchToChatAction(token))}
          />
        </InterviewFrame>
      );
    case "chat":
      return <Chat token={token} view={view} onView={setView} />;
  }
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="my-auto flex flex-col gap-3 py-10">
      <h1 className="font-heading text-2xl font-medium text-[#121212]">{title}</h1>
      <p className="text-sm leading-relaxed text-[#737373]">{children}</p>
      <Link href={APPLICATIONS_HREF} className="text-sm font-medium text-[#00994f] underline">
        Go to My Applications
      </Link>
    </section>
  );
}

function Finished({ businessName }: { businessName: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <section className="my-auto flex flex-col items-center gap-4 py-12 text-center">
      <CheckCircle2 aria-hidden className="size-14 text-[#00994f]" strokeWidth={1.5} />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-3xl font-medium text-[#121212] outline-none"
      >
        Submitted ✓
      </h1>
      <p className="max-w-sm text-base leading-relaxed text-[#737373]">
        {businessName} will review it. You&apos;ll get an email when they decide.
      </p>
      <p className="max-w-sm text-sm text-[#737373]">
        A person at {businessName} makes the decision, not the AI.
      </p>
      <Link
        href={APPLICATIONS_HREF}
        className="mt-2 inline-flex h-11 items-center rounded-full bg-[#00bf63] px-6 text-sm font-medium text-white transition-colors hover:bg-[#00994f]"
      >
        Go to My Applications
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Before you start
// ---------------------------------------------------------------------------------------------

const TIPS = [
  {
    title: "Use real examples",
    text: "Say what you did, how you did it, and what happened.",
  },
  {
    title: "Simple English is fine",
    text: "Hinglish is fine too. Clear ideas matter, not fancy words.",
  },
  {
    title: "You can't go back",
    text: "Once you send an answer, the next question comes. Take your time.",
  },
];

function Intro({
  view,
  pending,
  onStart,
}: {
  view: IntroView;
  pending: boolean;
  onStart: (mode: "chat" | "voice") => void;
}) {
  // Voice is the default when it is enabled; chat is always one tap away (and the fallback).
  const [mode, setMode] = useState<"chat" | "voice">(view.voiceEnabled ? "voice" : "chat");
  const [mic, setMic] = useState<MicStatus>("idle");
  const [agreed, setAgreed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const voice = view.voiceEnabled && mode === "voice";
  const canStart = agreed && !pending && (!voice || mic === "ready");

  return (
    <div className="flex flex-col gap-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#00994f]">
          Before you start
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl font-medium leading-tight text-[#121212] outline-none sm:text-3xl"
        >
          AI interview for {view.listingTitle}
        </h1>
        <p className="text-sm text-[#737373]">at {view.businessName}</p>
        <ul
          className="mt-2 flex flex-wrap gap-2 text-sm text-[#121212]"
          aria-label="About this interview"
        >
          <Fact icon={<ListChecks className="size-4" />}>{INTERVIEW_QUESTION_COUNT} questions</Fact>
          <Fact icon={<Clock className="size-4" />}>about 15 minutes</Fact>
          <Fact icon={<RotateCcw className="size-4" />}>one attempt</Fact>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5 text-sm leading-relaxed text-[#737373]">
        <h2 className="text-sm font-semibold text-[#121212]">What happens</h2>
        <p>
          An AI will ask you {INTERVIEW_QUESTION_COUNT} questions about this role, one at a time.{" "}
          {view.businessName} then reads a short summary of your answers. A person at{" "}
          {view.businessName} makes the decision, not the AI.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[#121212]">Tips</h2>
        <ol className="flex flex-col gap-2">
          {TIPS.map((tip, index) => (
            <li
              key={tip.title}
              className="flex gap-3 rounded-xl bg-white p-3 border border-[#e5e5e5] shadow-card"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#00bf63]/10 text-xs font-semibold text-[#00994f]"
              >
                {index + 1}
              </span>
              <span className="text-sm leading-snug">
                <span className="font-medium text-[#121212]">{tip.title}.</span>{" "}
                <span className="text-[#737373]">{tip.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {view.voiceEnabled ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-[#121212]">
            How do you want to answer?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["voice", "chat"] as const).map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border bg-white p-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none ${
                  mode === option ? "border-[#00bf63] ring-1 ring-[#00bf63]" : "border-[#e5e5e5]"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={option}
                  checked={mode === option}
                  onChange={() => setMode(option)}
                  className="sr-only"
                />
                <span className="font-medium text-[#121212]">
                  {option === "chat" ? "💬 Chat" : "🎤 Voice"}
                </span>
                <span className="text-xs text-[#737373]">
                  {option === "chat" ? "Type your answers" : "Speak your answers"}
                </span>
              </label>
            ))}
          </div>
          {voice ? (
            <div className="mt-1 flex flex-col gap-2">
              <p className="text-sm text-[#737373]">
                Find a quiet place, then check your microphone.
              </p>
              <MicCheck
                onStatus={setMic}
                onUseChat={() => {
                  setMode("chat");
                  setMic("idle");
                }}
              />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm leading-snug text-[#121212] border border-[#e5e5e5] shadow-card">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[#00bf63]"
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

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base sm:w-auto sm:self-start sm:px-6"
          disabled={!canStart}
          onClick={() => onStart(view.voiceEnabled ? mode : "chat")}
        >
          {pending ? "Starting…" : "I agree, start"}
        </Button>
        {voice && mic !== "ready" ? (
          <p className="text-xs text-[#737373]">Check your microphone first, or choose Chat.</p>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 border border-[#e5e5e5] shadow-card">
      <span aria-hidden className="text-[#00994f]">
        {icon}
      </span>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Chat room
// ---------------------------------------------------------------------------------------------

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Chat({
  token,
  view,
  onView,
}: {
  token: string;
  view: ChatView;
  onView: (view: StudentInterviewView) => void;
}) {
  const turns = view.transcript.length;
  const [text, setText] = useState("");
  /** The answer being sent, shown at once as the student's bubble. */
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pasted = useRef(false);
  const tabLeaves = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Integrity log (from aural-oss): count tab leaves; sent with the next answer.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tabLeaves.current += 1;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Restore an unsent draft for this question (after a refresh). Read after mount: the server
  // can't see localStorage.
  useEffect(() => {
    const draft = loadDraft(browserStorage(), token, turns);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of browser storage
    if (draft) setText((current) => current || draft);
  }, [token, turns]);

  // Newest message in view; the answer box gets focus after each interviewer message.
  const lastTurn = view.transcript.at(-1);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      block: "end",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [turns, sending, error]);
  useEffect(() => {
    if (lastTurn?.role === "ai" && !pending) inputRef.current?.focus({ preventScroll: true });
  }, [turns, lastTurn?.role, pending]);

  // The answer box grows with the text (up to a few lines, then scrolls).
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 192)}px`;
  }, [text]);

  const submit = () => {
    const answer = text;
    if (!answer.trim() || pending) return;
    const input = {
      text: answer,
      expectedIndex: view.currentIndex,
      expectedTurns: turns,
      pasted: pasted.current,
      tabLeaves: tabLeaves.current,
    };
    setError(null);
    setSending(answer);
    setText("");
    startTransition(async () => {
      try {
        const state = await submitAnswerAction(token, input);
        if (state.error) {
          setText(answer);
          setError(state.error);
        } else {
          clearDraft(browserStorage(), token);
          pasted.current = false;
          tabLeaves.current = 0;
        }
        onView(state.view);
      } catch {
        setText(answer);
        setError(SEND_FAILED);
      } finally {
        setSending(null);
      }
    });
  };

  const shown = questionNumber(view.currentIndex, view.questionCount);
  const onFollowUp = lastTurn?.role === "ai" && lastTurn.followUp;
  const lastAiText = [...view.transcript].reverse().find((turn) => turn.role === "ai")?.text;

  return (
    <InterviewFrame businessName={view.businessName} listingTitle={view.listingTitle} wide>
      {/* Screen readers hear each new interviewer message once. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {pending ? "Interviewer is typing" : lastAiText ? `Interviewer: ${lastAiText}` : ""}
      </p>
      <InterviewStage
        orb={
          <InterviewerOrb
            status={pending ? "thinking" : "listening"}
            title="AI Interviewer"
            subtitle={`Interviewing you for ${view.listingTitle} at ${view.businessName}.`}
            current={shown}
            total={view.questionCount}
            label={onFollowUp ? "follow-up" : undefined}
          />
        }
        transcript={
          <TranscriptPanel live>
            <ol aria-label="Conversation" className="flex flex-col gap-5">
              {view.transcript.map((turn, index) => (
                <TranscriptEntry key={index} role={turn.role}>
                  {turn.text}
                </TranscriptEntry>
              ))}
              {sending !== null ? (
                <TranscriptEntry role="student" pending>
                  {sending}
                </TranscriptEntry>
              ) : null}
              {pending ? <TypingIndicator /> : null}
            </ol>
            <div ref={endRef} />
          </TranscriptPanel>
        }
        controls={
          <form
            className="sticky bottom-0 z-10 -mx-4 bg-[#fafafa]/95 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:static md:mx-auto md:w-full md:max-w-2xl md:bg-transparent md:p-0 md:backdrop-blur-none"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {error ? (
              <div
                role="alert"
                className="mb-2 flex items-start justify-between gap-3 rounded-xl bg-[#fdf1ec] px-3 py-2 text-sm text-[#8a3b1f]"
              >
                <span>{error}</span>
                {text.trim() && !pending ? (
                  <button type="submit" className="shrink-0 font-medium underline">
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}
            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="answer"
                ref={inputRef}
                rows={1}
                value={text}
                maxLength={MAX_INTERVIEW_ANSWER_LENGTH}
                disabled={pending}
                enterKeyHint="send"
                placeholder={pending ? "Waiting for the interviewer…" : "Type an answer…"}
                aria-describedby="answer-hint"
                className="max-h-48 min-h-12 flex-1 resize-none rounded-[24px] border border-[#d4d4d4] bg-white px-5 py-3 text-base leading-snug shadow-card outline-none transition-colors placeholder:text-[#a3a3a3] focus-visible:border-[#121212] focus-visible:ring-3 focus-visible:ring-[#00bf63]/15 disabled:opacity-60 motion-reduce:transition-none"
                onChange={(event) => {
                  setText(event.target.value);
                  saveDraft(browserStorage(), token, turns, event.target.value);
                }}
                onKeyDown={(event) => {
                  const { key, shiftKey, altKey, keyCode } = event;
                  const isComposing = event.nativeEvent.isComposing;
                  if (!isSendKey({ key, shiftKey, altKey, keyCode, isComposing })) return;
                  event.preventDefault();
                  submit();
                }}
                onPaste={() => {
                  pasted.current = true;
                }}
              />
              <Button
                type="submit"
                size="icon-lg"
                aria-label="Send answer"
                className="size-12 shrink-0 rounded-full"
                disabled={pending || !text.trim()}
              >
                <SendHorizontal className="size-5" />
              </Button>
            </div>
            <p
              id="answer-hint"
              className="mt-2 flex justify-between gap-2 px-2 text-xs text-[#a3a3a3]"
            >
              <span className="pointer-coarse:hidden">
                Enter to send · Shift+Enter for a new line
              </span>
              <span className="hidden pointer-coarse:inline">
                Your draft is saved on this phone
              </span>
              {showCharCount(text.length) ? (
                <span
                  className={
                    text.length >= MAX_INTERVIEW_ANSWER_LENGTH ? "text-[#8a3b1f]" : undefined
                  }
                >
                  {text.length}/{MAX_INTERVIEW_ANSWER_LENGTH}
                </span>
              ) : null}
            </p>
          </form>
        }
      />
    </InterviewFrame>
  );
}

function TypingIndicator() {
  return (
    <li className="flex flex-col gap-1.5" aria-hidden>
      <span className="font-mono text-[11px] tracking-[0.14em] text-[#a3a3a3] uppercase">
        Interviewer
      </span>
      <span className="flex h-6 items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-[#00bf63]/60 motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </li>
  );
}
