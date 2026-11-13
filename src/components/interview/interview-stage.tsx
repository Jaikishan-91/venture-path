import { cn } from "cn";

/**
 * Two-panel interview room layout shared by chat and voice: the interviewer "orb" card on the
 * left (status, who is asking, question progress) and the live transcript on the right.
 */

export type OrbStatus = "ready" | "listening" | "speaking" | "thinking" | "connecting";

const STATUS_LABELS: Record<OrbStatus, string> = {
  ready: "Ready",
  listening: "Your turn",
  speaking: "Speaking",
  thinking: "Thinking",
  connecting: "Connecting",
};

const ORB_MOTION: Record<OrbStatus, string> = {
  ready: "",
  listening: "motion-safe:animate-[orb-breathe_3.2s_ease-in-out_infinite]",
  speaking: "motion-safe:animate-[orb-breathe_1.1s_ease-in-out_infinite]",
  thinking: "motion-safe:animate-[orb-breathe_1.8s_ease-in-out_infinite]",
  connecting: "motion-safe:animate-pulse",
};

export function InterviewStage({
  orb,
  transcript,
  controls,
}: {
  orb: React.ReactNode;
  transcript: React.ReactNode;
  controls: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-8">
      <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        {orb}
        {transcript}
      </div>
      {controls}
    </div>
  );
}

export function InterviewerOrb({
  status,
  title,
  subtitle,
  current,
  total,
  label,
}: {
  status: OrbStatus;
  title: string;
  subtitle: string;
  /** 1-based question being answered; progress is hidden without it. */
  current?: number;
  total?: number;
  /** Text after "Question n of N", e.g. "follow-up". */
  label?: string;
}) {
  return (
    <section
      aria-label="Interviewer"
      className="relative flex flex-col overflow-hidden rounded-[20px] border border-[#e5e5e5] bg-[linear-gradient(180deg,#f7faf8_0%,#f1f3f2_100%)] px-4 py-4 max-md:sticky max-md:top-[calc(env(safe-area-inset-top)+4.25rem)] max-md:z-10 max-md:shadow-card md:min-h-[520px] md:items-center md:rounded-[24px] md:px-6 md:pt-14 md:pb-6"
    >
      <span
        aria-live="polite"
        className="absolute top-3 right-3 inline-flex items-center gap-2 rounded-md border md:top-4 md:right-auto md:left-4 border-[#e5e5e5] bg-white/80 px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] text-[#404040] uppercase"
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            status === "speaking" || status === "listening" ? "bg-[#00bf63]" : "bg-[#a3a3a3]",
            status !== "ready" && "motion-safe:animate-pulse",
          )}
        />
        {STATUS_LABELS[status]}
      </span>

      <div className="flex items-center gap-3 md:flex-1 md:flex-col md:gap-0">
        <div className="relative flex size-12 shrink-0 items-center justify-center md:size-auto md:flex-1 md:py-4">
          <div
            aria-hidden
            className={cn(
              "size-14 rounded-full bg-[radial-gradient(circle,rgb(0_191_99/0.55)_0%,rgb(0_191_99/0.22)_38%,rgb(0_191_99/0)_70%)] blur-md md:size-64 md:blur-xl",
              ORB_MOTION[status],
            )}
          />
          <div
            aria-hidden
            className="absolute size-5 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.7)_0%,transparent_70%)] blur-sm md:size-24 md:blur-md"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 pr-24 md:items-center md:gap-1 md:pr-0 md:text-center">
          <h1 className="text-[17px] font-semibold tracking-tight text-[#121212] md:text-[26px]">
            {title}
          </h1>
          <p className="text-[12px] leading-snug text-[#737373] md:max-w-xs md:text-[13px] md:leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>

      {current && total ? (
        <div className="mt-3 flex items-center justify-between gap-3 md:mt-6 md:flex-col md:justify-start md:gap-2">
          <div
            role="progressbar"
            aria-label="Interview progress"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={current}
            aria-valuetext={`Question ${current} of ${total}`}
            className="flex items-center gap-2"
          >
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none",
                  index === current - 1
                    ? "w-6 bg-[#00bf63]"
                    : index < current - 1
                      ? "w-3.5 bg-[#00bf63]/45"
                      : "w-3.5 bg-[#d4d4d4]",
                )}
              />
            ))}
          </div>
          <p className="text-[12px] text-[#737373]">
            Question {current} of {total}
            {label ? <span> · {label}</span> : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function TranscriptPanel({ live, children }: { live?: boolean; children: React.ReactNode }) {
  return (
    <section
      aria-label="Transcript"
      className="flex min-h-[260px] flex-col overflow-hidden rounded-[24px] border border-[#e5e5e5] bg-white shadow-card md:max-h-[calc(100dvh-14rem)] md:min-h-[520px]"
    >
      <div className="flex items-center justify-between border-b border-[#e5e5e5] px-5 py-3 font-mono text-[11px] tracking-[0.14em] text-[#a3a3a3] uppercase">
        <span>Transcript</span>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-[#00994f]">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[#00bf63] motion-safe:animate-pulse"
            />
            Live
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">{children}</div>
    </section>
  );
}

/** One turn in the transcript, labelled like a script: INTERVIEWER / YOU. */
export function TranscriptEntry({
  role,
  pending,
  children,
}: {
  role: "ai" | "student";
  pending?: boolean;
  children: React.ReactNode;
}) {
  const ai = role === "ai";
  return (
    <li className={cn("flex flex-col gap-1.5", pending && "opacity-60")}>
      <span
        className={cn(
          "font-mono text-[11px] tracking-[0.14em] uppercase",
          ai ? "text-[#a3a3a3]" : "text-[#00994f]",
        )}
      >
        {ai ? "Interviewer" : "You"}
      </span>
      <p className="text-[15px] leading-relaxed break-words whitespace-pre-line text-[#262626]">
        {children}
      </p>
    </li>
  );
}
