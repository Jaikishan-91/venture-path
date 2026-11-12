"use client";

import { ArrowUp, CheckCircle2, Clock, ListChecks, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { InterviewFrame, InterviewProgress } from "@/components/interview/interview-frame";
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
        <InterviewFrame
          businessName={view.businessName}
          listingTitle={view.listingTitle}
          progress={
            <InterviewProgress
              current={questionNumber(view.currentIndex, view.questionCount)}
              total={view.questionCount}
            />
          }
        >
          <div className="py-5">
            <VoiceRoom
              token={token}
              onSwitchToChat={() => runAction(() => switchToChatAction(token))}
            />
          </div>
        </InterviewFrame>
      );
    case "chat":
      return <Chat token={token} view={view} onView={setView} />;
  }
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="my-auto flex flex-col gap-3 py-10">
      <h1 className="font-heading text-2xl text-[#1b2a26]">{title}</h1>
      <p className="text-sm leading-relaxed text-[#4a4d53]">{children}</p>
      <Link href={APPLICATIONS_HREF} className="text-sm font-medium text-[#26594a] underline">
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
      <CheckCircle2 aria-hidden className="size-14 text-[#26594a]" strokeWidth={1.5} />
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-3xl text-[#1b2a26] outline-none"
      >
        Submitted ✓
      </h1>
      <p className="max-w-sm text-base leading-relaxed text-[#4a4d53]">
        {businessName} will review it. You&apos;ll get an email when they decide.
      </p>
      <p className="max-w-sm text-sm text-[#4a4d53]">
        A person at {businessName} makes the decision, not the AI.
      </p>
      <Link
        href={APPLICATIONS_HREF}
        className="mt-2 inline-flex h-11 items-center rounded-lg bg-[#26594a] px-5 text-sm font-medium text-[#f4eddd] transition-colors hover:bg-[#26594a]/85"
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
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const [mic, setMic] = useState<MicStatus>("idle");
  const [agreed, setAgreed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const voice = view.voiceEnabled && mode === "voice";
  const canStart = agreed && !pending && (!voice || mic === "ready");

  return (
    <div className="flex flex-col gap-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <section className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#26594a]">
          Before you start
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-tight text-[#1b2a26] outline-none sm:text-3xl"
        >
          AI interview for {view.listingTitle}
        </h1>
        <p className="text-sm text-[#4a4d53]">at {view.businessName}</p>
        <ul
          className="mt-2 flex flex-wrap gap-2 text-sm text-[#1b2a26]"
          aria-label="About this interview"
        >
          <Fact icon={<ListChecks className="size-4" />}>{INTERVIEW_QUESTION_COUNT} questions</Fact>
          <Fact icon={<Clock className="size-4" />}>about 15 minutes</Fact>
          <Fact icon={<RotateCcw className="size-4" />}>one attempt</Fact>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5 text-sm leading-relaxed text-[#4a4d53]">
        <h2 className="text-sm font-semibold text-[#1b2a26]">What happens</h2>
        <p>
          An AI will ask you {INTERVIEW_QUESTION_COUNT} questions about this role, one at a time.{" "}
          {view.businessName} then reads a short summary of your answers. A person at{" "}
          {view.businessName} makes the decision, not the AI.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[#1b2a26]">Tips</h2>
        <ol className="flex flex-col gap-2">
          {TIPS.map((tip, index) => (
            <li
              key={tip.title}
              className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-[#ecedef]"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#26594a]/10 text-xs font-semibold text-[#26594a]"
              >
                {index + 1}
              </span>
              <span className="text-sm leading-snug">
                <span className="font-medium text-[#1b2a26]">{tip.title}.</span>{" "}
                <span className="text-[#4a4d53]">{tip.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {view.voiceEnabled ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-[#1b2a26]">
            How do you want to answer?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["chat", "voice"] as const).map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border bg-white p-3 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none ${
                  mode === option ? "border-[#26594a] ring-1 ring-[#26594a]" : "border-[#dfe1e5]"
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
                <span className="font-medium text-[#1b2a26]">
                  {option === "chat" ? "💬 Chat" : "🎤 Voice"}
                </span>
                <span className="text-xs text-[#4a4d53]">
                  {option === "chat" ? "Type your answers" : "Speak your answers"}
                </span>
              </label>
            ))}
          </div>
          {voice ? (
            <div className="mt-1 flex flex-col gap-2">
              <p className="text-sm text-[#4a4d53]">
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

      <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm leading-snug text-[#1b2a26] ring-1 ring-[#ecedef]">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[#26594a]"
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
          <p className="text-xs text-[#4a4d53]">Check your microphone first, or choose Chat.</p>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#ecedef]">
      <span aria-hidden className="text-[#26594a]">
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
    <InterviewFrame
      businessName={view.businessName}
      listingTitle={view.listingTitle}
      progress={
        <InterviewProgress
          current={shown}
          total={view.questionCount}
          label={onFollowUp ? "follow-up" : undefined}
        />
      }
    >
      {/* Screen readers hear each new interviewer message once. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {pending ? "Interviewer is typing" : lastAiText ? `Interviewer: ${lastAiText}` : ""}
      </p>
      <ol aria-label="Conversation" className="flex flex-1 flex-col gap-3 py-5">
        {view.transcript.map((turn, index) => (
          <Bubble key={index} role={turn.role}>
            {turn.text}
          </Bubble>
        ))}
        {sending !== null ? <Bubble role="student">{sending}</Bubble> : null}
        {pending ? <TypingIndicator /> : null}
      </ol>
      <div ref={endRef} />

      <form
        className="sticky bottom-0 z-10 -mx-4 border-t border-[#ecedef] bg-[#f7f7f9] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {error ? (
          <div
            role="alert"
            className="mb-2 flex items-start justify-between gap-3 rounded-lg bg-[#fdf1ec] px-3 py-2 text-sm text-[#8a3b1f]"
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
            placeholder={pending ? "Waiting for the interviewer…" : "Type your answer…"}
            aria-describedby="answer-hint"
            className="max-h-48 min-h-11 flex-1 resize-none rounded-2xl border border-[#dfe1e5] bg-white px-4 py-2.5 text-base leading-snug outline-none transition-colors placeholder:text-[#8b8e94] focus-visible:border-[#26594a] focus-visible:ring-3 focus-visible:ring-[#26594a]/20 disabled:opacity-60 motion-reduce:transition-none"
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
            className="size-11 shrink-0 rounded-full"
            disabled={pending || !text.trim()}
          >
            <ArrowUp className="size-5" />
          </Button>
        </div>
        <p id="answer-hint" className="mt-1.5 flex justify-between gap-2 text-xs text-[#6b6e74]">
          <span className="pointer-coarse:hidden">Enter to send · Shift+Enter for a new line</span>
          <span className="hidden pointer-coarse:inline">Your draft is saved on this phone</span>
          {showCharCount(text.length) ? (
            <span
              className={text.length >= MAX_INTERVIEW_ANSWER_LENGTH ? "text-[#8a3b1f]" : undefined}
            >
              {text.length}/{MAX_INTERVIEW_ANSWER_LENGTH}
            </span>
          ) : null}
        </p>
      </form>
    </InterviewFrame>
  );
}

function Bubble({ role, children }: { role: "ai" | "student"; children: React.ReactNode }) {
  const ai = role === "ai";
  return (
    <li className={`flex flex-col gap-1 ${ai ? "items-start" : "items-end"}`}>
      <span className="sr-only">{ai ? "Interviewer:" : "You:"}</span>
      <span
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-line ${
          ai
            ? "rounded-tl-md bg-white text-[#1b2a26] ring-1 ring-[#ecedef]"
            : "rounded-tr-md bg-[#26594a] text-[#f4eddd]"
        }`}
      >
        {children}
      </span>
    </li>
  );
}

function TypingIndicator() {
  return (
    <li className="flex items-center gap-2" aria-hidden>
      <span className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3 ring-1 ring-[#ecedef]">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full bg-[#26594a]/60 motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-[#6b6e74]">Interviewer is typing…</span>
    </li>
  );
}
