import { AiInterviewReport } from "@/components/hiring/ai-interview-report";
import { buttonVariants } from "@/components/ui/button";
import type { OrgInterviewView } from "@/lib/ai-interview";
import { getLlmConfig } from "@/lib/llm/config";
import { retryInterviewReportAction } from "./ai-interview-actions";

/**
 * The latest AI interview of a candidate on the candidate page. No Move / Reject here: the
 * page's single action bar does that (plan 2026-11-12-hiring-and-ai-interview-v2, H3).
 */
export function AiInterviewSection({ interview }: { interview: OrgInterviewView }) {
  const retry = (
    <form action={retryInterviewReportAction}>
      <input type="hidden" name="sessionId" value={interview.id} />
      <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Retry report
      </button>
    </form>
  );

  // With AI switched off a retry can't work; the panel says "AI unavailable" instead (PRODUCT.md §3 rule 7).
  const aiAvailable = getLlmConfig().kind !== "disabled";
  return (
    <AiInterviewReport
      interview={interview}
      actions={undefined}
      retry={aiAvailable ? retry : undefined}
      aiAvailable={aiAvailable}
    />
  );
}
