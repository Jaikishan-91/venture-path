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
import { Loader2, Mic, MessageSquare, PhoneOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

export function VoiceRoom({
  token,
  onSwitchToChat,
}: {
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
      <Card>
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
      </Card>
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
      >
        <RoomAudioRenderer />
        <LiveInterview
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice interview</CardTitle>
        <CardDescription>
          The AI interviewer will ask its questions out loud. Answer in your own words; captions
          show what was heard. Find a quiet place. Only the text of the conversation is saved, never
          the audio.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button className="h-11 w-full" onClick={start} disabled={phase.kind === "starting"}>
          {phase.kind === "starting" ? <Loader2 className="animate-spin" /> : <Mic />}
          {phase.kind === "starting" ? "Connecting…" : "Allow microphone and start"}
        </Button>
        <Button variant="ghost" className="h-11 w-full" onClick={onSwitchToChat}>
          <MessageSquare /> Switch to chat
        </Button>
      </CardContent>
    </Card>
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
    <Card role="alert">
      <CardHeader>
        <CardTitle>Let&apos;s continue in chat</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="h-11 w-full" onClick={onSwitchToChat}>
          <MessageSquare /> Switch to chat now ({Math.max(seconds, 0)})
        </Button>
      </CardContent>
    </Card>
  );
}

const STATE_LABELS: Record<string, string> = {
  speaking: "Interviewer is speaking…",
  listening: "Listening — your turn to speak",
  thinking: "Thinking…",
  idle: "Listening — your turn to speak",
};

function LiveInterview({
  onConnectionLost,
  onFinished,
  onEnd,
  onSwitchToChat,
}: {
  onConnectionLost: () => void;
  onFinished: () => void;
  onEnd: () => void;
  onSwitchToChat: () => void;
}) {
  const { agent, state } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
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

  const speaking = state === "speaking";
  const label = agent
    ? (STATE_LABELS[state] ?? "Connecting your interviewer…")
    : "Connecting your interviewer…";
  const captions = transcriptions.slice(-6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice interview</CardTitle>
        <div
          aria-live="polite"
          className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
            speaking ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
          }`}
        >
          {agent ? (
            <Mic className={speaking ? "" : "animate-pulse"} />
          ) : (
            <Loader2 className="animate-spin" />
          )}
          {label}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex max-h-72 min-h-32 flex-col gap-2 overflow-y-auto rounded-lg border p-3 text-sm">
          {captions.length === 0 ? (
            <p className="text-muted-foreground">Captions will appear here.</p>
          ) : (
            captions.map((t) => {
              const mine = t.participantInfo.identity === localParticipant.identity;
              return (
                <p key={t.streamInfo.id} className={mine ? "text-right" : ""}>
                  <span className="block text-xs text-muted-foreground">
                    {mine ? "You" : "Interviewer"}
                  </span>
                  {t.text}
                </p>
              );
            })
          )}
          <div ref={captionsEnd} />
        </div>
        <StartAudio
          label="Tap to hear the interviewer"
          className="h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <EndButton onEnd={onEnd} />
          <Button variant="outline" className="h-11 w-full" onClick={onSwitchToChat}>
            <MessageSquare /> Switch to chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  const room = useRoomContext();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="destructive" className="h-11 w-full" onClick={() => setConfirming(true)}>
        <PhoneOff /> End interview
      </Button>
    );
  }
  return (
    <Button
      variant="destructive"
      className="h-11 w-full"
      onClick={() => {
        onEnd();
        // Leaving the room ends the interviewer's session; the transcript so far is saved.
        void room.disconnect();
      }}
    >
      Tap again to end
    </Button>
  );
}
