"use client";

import { CheckCircle2, Loader2, Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Microphone check before a voice interview: asks for permission and shows a live input level
 * (Web Audio analyser). Nothing is recorded or sent; the stream stops when this unmounts.
 */

export type MicStatus = "idle" | "asking" | "ready" | "failed";

/** Input level (0–1) above which we say "we can hear you". */
const HEARD_LEVEL = 0.08;

export function MicCheck({
  onStatus,
  onUseChat,
}: {
  onStatus: (status: MicStatus) => void;
  onUseChat: () => void;
}) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [heard, setHeard] = useState(false);
  const barRef = useRef<HTMLSpanElement>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const update = (next: MicStatus) => {
    setStatus(next);
    onStatus(next);
  };

  async function check() {
    cleanup.current?.();
    setHeard(false);
    update("asking");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      update("failed");
      return;
    }
    let frame = 0;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        // RMS of speech is ~0.02–0.2; scale so normal speech fills most of the bar.
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 6);
        if (barRef.current) barRef.current.style.transform = `scaleX(${level})`;
        if (level > HEARD_LEVEL) setHeard(true);
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // No Web Audio: permission still worked, so voice can still be tried.
    }
    cleanup.current = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
      cleanup.current = null;
    };
    update("ready");
  }

  if (status === "failed") {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl bg-[#fdf1ec] p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-[#8a3b1f]">
          <MicOff className="size-4" /> We couldn&apos;t use your microphone
        </p>
        <p className="text-[#737373]">
          Allow the microphone in your browser settings and check again, or answer in chat instead.
          Chat works on any phone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" onClick={onUseChat}>
            Use chat instead
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={check}>
            Check again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm border border-[#e5e5e5] shadow-card">
        <p className="flex items-center gap-2 font-medium text-[#121212]">
          {heard ? (
            <>
              <CheckCircle2 className="size-4 text-[#00994f]" /> We can hear you
            </>
          ) : (
            <>
              <Mic className="size-4" /> Say something — the bar should move
            </>
          )}
        </p>
        <span
          aria-hidden
          className="block h-2 overflow-hidden rounded-full bg-[#00bf63]/12"
          title="Microphone level"
        >
          <span
            ref={barRef}
            className="block h-full origin-left scale-x-0 rounded-full bg-[#00bf63]"
          />
        </span>
        <p className="text-xs text-[#737373]">Nothing is recorded during this check.</p>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="self-start"
      onClick={check}
      disabled={status === "asking"}
    >
      {status === "asking" ? <Loader2 className="animate-spin" /> : <Mic />}
      {status === "asking" ? "Waiting for permission…" : "Check my microphone"}
    </Button>
  );
}
