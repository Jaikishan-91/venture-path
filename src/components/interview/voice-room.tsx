"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Loader2, Mic, MicOff, MessageSquare, PhoneOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  InterviewStage,
  InterviewerOrb,
  TranscriptEntry,
  TranscriptPanel,
  type OrbStatus,
} from "@/components/interview/interview-stage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { VoiceJoin } from "@/lib/v2/types";

/**
 * Voice mode of the AI interview (docs/PRODUCT.md Module 5). The student allows the microphone,
 * talks with the AI interviewer over LiveKit and sees live captions for both sides. Chat is always
 * one tap away, and is offered automatically when the mic or the connection fails.
 */

type Phase =
  | { kind: "intro" }
  | { kind: "starting" }
  | { kind: "live"; join: VoiceJoin }
  | { kind: "ended"; early: boolean }
  | { kind: "failed"; message: string };

/** Seconds before a failure moves the student to chat on its own. */
const AUTO_SWITCH_SECONDS = 6;
/** How long to wait for the interviewer to join before giving up on voice. */
const AGENT_JOIN_TIMEOUT_MS = 30_000;

const MIC_DENIED =
  "We couldn't use your microphone. You can allow it in your browser settings, or continue the interview in chat.";
const CONNECTION_FAILED =
  "The voice connection didn't work. Your answers so far are saved — let's continue in chat from the same question.";

type StageInfo = {
  businessName: string;
  listingTitle: string;
  /** 1-based question number when the room opened. */
  current: number;
  total: number;
};

export function VoiceRoom({
  token,
  onSwitchToChat,
  ...info
}: StageInfo & {
  token: string;
  onSwitchToChat: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const router = useRouter();
  const endedByStudent = useRef(false);
  const finished = useRef(false);

  const fail = useCallback((message: string) => setPhase({ kind: "failed", message }), []);

  async function start() {
    setPhase({ kind: "starting" });
    try {
      // Ask for the microphone first so the browser prompt appears before we connect.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      fail(MIC_DENIED);
      return;
    }
    try {
      const response = await fetch(`/api/interview/${encodeURIComponent(token)}/livekit-token`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPhase({ kind: "live", join: (await response.json()) as VoiceJoin });
    } catch {
      fail(CONNECTION_FAILED);
    }
  }

  if (phase.kind === "failed") {
    return <FailedCard message={phase.message} onSwitchToChat={onSwitchToChat} />;
  }

  if (phase.kind === "ended") {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle>{phase.early ? "Voice interview stopped" : "Thank you!"}</CardTitle>
          <CardDescription>
            {phase.early
              ? "Your answers so far are saved. You can finish the remaining questions in chat."
              : "The interview is over. The business will review it and make the decision."}
          </CardDescription>
        </CardHeader>
        {phase.early ? (
          <CardContent>
            <Button className="h-11 w-full" onClick={onSwitchToChat}>
              <MessageSquare /> Continue in chat
            </Button>
          </CardContent>
        ) : null}
      </CenteredCard>
    );
  }

  if (phase.kind === "live") {
    return (
      <LiveKitRoom
        serverUrl={phase.join.url}
        token={phase.join.token}
        connect
        audio
        video={false}
        onMediaDeviceFailure={() => fail(MIC_DENIED)}
        onError={() => fail(CONNECTION_FAILED)}
        onDisconnected={() => {
          if (endedByStudent.current) setPhase({ kind: "ended", early: true });
          else if (!finished.current) fail(CONNECTION_FAILED);
        }}
        className="flex flex-1 flex-col"
      >
        <RoomAudioRenderer />
        <LiveInterview
          info={info}
          onConnectionLost={() => fail(CONNECTION_FAILED)}
          onFinished={() => {
            if (endedByStudent.current) return;
            finished.current = true;
            setPhase({ kind: "ended", early: false });
            router.refresh();
          }}
          onEnd={() => {
            endedByStudent.current = true;
          }}
          onSwitchToChat={onSwitchToChat}
        />
      </LiveKitRoom>
    );
  }

  const starting = phase.kind === "starting";
  return (
    <InterviewStage
      orb={<Orb info={info} status={starting ? "connecting" : "ready"} />}
      transcript={
        <TranscriptPanel>
          <p className="my-auto text-center text-[14px] leading-relaxed text-[#737373]">
            The AI interviewer will ask its questions out loud. Answer in your own words; captions
            of both sides appear here. Find a quiet place. Only the text is saved, never the audio.
          </p>
        </TranscriptPanel>
      }
      controls={
        <div className="flex flex-col items-center gap-2">
          <Button size="lg" onClick={start} disabled={starting}>
            {starting ? <Loader2 className="animate-spin" /> : <Mic />}
            {starting ? "Connecting…" : "Allow microphone and start"}
          </Button>
          <Button variant="ghost" onClick={onSwitchToChat}>
            <MessageSquare /> Switch to chat
          </Button>
        </div>
      }
    />
  );
}

function Orb({ info, status }: { info: StageInfo; status: OrbStatus }) {
  return (
    <InterviewerOrb
      status={status}
      title="AI Interviewer"
      subtitle={`Interviewing you for ${info.listingTitle} at ${info.businessName}.`}
      current={info.current}
      total={info.total}
    />
  );
}

function CenteredCard({ children, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <div className="my-auto flex justify-center py-10">
      <Card className="w-full max-w-md" {...props}>
        {children}
      </Card>
    </div>
  );
}

function FailedCard({ message, onSwitchToChat }: { message: string; onSwitchToChat: () => void }) {
  const [seconds, setSeconds] = useState(AUTO_SWITCH_SECONDS);
  useEffect(() => {
    if (seconds <= 0) {
      onSwitchToChat();
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, onSwitchToChat]);

  return (
    <CenteredCard role="alert">
      <CardHeader>
        <CardTitle>Let&apos;s continue in chat</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="h-11 w-full" onClick={onSwitchToChat}>
          <MessageSquare /> Switch to chat now ({Math.max(seconds, 0)})
        </Button>
      </CardContent>
    </CenteredCard>
  );
}

const ORB_STATUS: Record<string, OrbStatus> = {
  speaking: "speaking",
  listening: "listening",
  thinking: "thinking",
  idle: "listening",
};

function LiveInterview({
  info,
  onConnectionLost,
  onFinished,
  onEnd,
  onSwitchToChat,
}: {
  info: StageInfo;
  onConnectionLost: () => void;
  onFinished: () => void;
  onEnd: () => void;
  onSwitchToChat: () => void;
}) {
  const { agent, state } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();
  const agentSeen = useRef(false);
  const captionsEnd = useRef<HTMLDivElement>(null);

  // Interviewer never arrived: voice isn't working, fall back to chat.
  useEffect(() => {
    if (agent) return;
    const timer = setTimeout(() => {
      if (!agentSeen.current) onConnectionLost();
    }, AGENT_JOIN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [agent, onConnectionLost]);

  // The interviewer leaves when the interview is over (or its time limit is reached).
  useEffect(() => {
    if (agent) agentSeen.current = true;
    else if (agentSeen.current) onFinished();
  }, [agent, onFinished]);

  useEffect(() => {
    captionsEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [transcriptions]);

  const status: OrbStatus = agent ? (ORB_STATUS[state] ?? "connecting") : "connecting";

  return (
    <InterviewStage
      orb={<Orb info={info} status={status} />}
      transcript={
        <TranscriptPanel live={Boolean(agent)}>
          {transcriptions.length === 0 ? (
            <p className="my-auto text-center text-[14px] text-[#a3a3a3]">
              {agent ? "Captions will appear here." : "Connecting your interviewer…"}
            </p>
          ) : (
            <ol aria-label="Captions" className="flex flex-col gap-5">
              {transcriptions.map((t) => (
                <TranscriptEntry
                  key={t.streamInfo.id}
                  role={t.participantInfo.identity === localParticipant.identity ? "student" : "ai"}
                >
                  {t.text}
                </TranscriptEntry>
              ))}
            </ol>
          )}
          <div ref={captionsEnd} />
        </TranscriptPanel>
      }
      controls={
        <div className="flex flex-col items-center gap-3 pb-[env(safe-area-inset-bottom)]">
          <StartAudio
            label="Tap to hear the interviewer"
            className="h-10 rounded-full bg-[#00bf63] px-5 text-sm font-medium text-white"
          />
          <div className="flex items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white p-1.5 shadow-card">
            <button
              type="button"
              aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
              aria-pressed={!isMicrophoneEnabled}
              onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
              className={`flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors ${
                isMicrophoneEnabled
                  ? "text-[#121212] hover:bg-[#f5f5f5]"
                  : "bg-[#fdf1ec] text-[#8a3b1f]"
              }`}
            >
              {isMicrophoneEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <EndButton onEnd={onEnd} />
          </div>
          <button
            type="button"
            onClick={onSwitchToChat}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#737373] transition-colors hover:bg-[#f5f5f5] hover:text-[#121212]"
          >
            <MessageSquare className="size-4" /> Switch to chat
          </button>
        </div>
      }
    />
  );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  const room = useRoomContext();
  const [confirming, setConfirming] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        onEnd();
        // Leaving the room ends the interviewer's session; the transcript so far is saved.
        void room.disconnect();
      }}
      className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-[15px] font-medium text-white transition-colors ${
        confirming ? "bg-[#dc2626] hover:bg-[#b91c1c]" : "bg-[#121212] hover:bg-[#262626]"
      }`}
    >
      <PhoneOff className="size-[18px]" />
      {confirming ? "Tap again to end" : "End"}
    </button>
  );
}
