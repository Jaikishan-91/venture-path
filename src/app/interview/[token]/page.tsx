import type { Metadata, Viewport } from "next";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InterviewFrame, RoomMessage } from "@/components/interview/interview-frame";
import { buttonVariants } from "@/components/ui/button";
import { getInterviewForStudent, isInterviewTokenShape } from "@/lib/ai-interview";
import { getSession } from "@/lib/authz";
import { InterviewClient } from "./interview-client";

export const metadata: Metadata = { title: "AI interview · Venture Path" };

/** The phone keyboard shrinks the layout, so the sticky answer box stays above it. */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

/**
 * The student's AI interview room from the emailed link (docs/PRODUCT.md Module 5). A focused,
 * full-height page: no site nav or footer.
 */
export default async function InterviewPage({ params }: PageProps<"/interview/[token]">) {
  const { token } = await params;
  const session = await getSession();
  if (!session && isInterviewTokenShape(token)) {
    redirect(`/sign-in?next=${encodeURIComponent(`/interview/${token}`)}`);
  }
  const wrongAccount = session && session.user.role !== "user";
  if (wrongAccount) {
    return (
      <InterviewFrame>
        <RoomMessage
          icon={<UserRound />}
          title="Sign in as a student"
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Go to your dashboard
            </Link>
          }
        >
          <p>
            This interview belongs to a student account. Sign out, then open the link again and sign
            in with the account you applied with.
          </p>
        </RoomMessage>
      </InterviewFrame>
    );
  }
  const view = session
    ? await getInterviewForStudent(session.user.id, token)
    : ({ state: "not_found" } as const);
  return <InterviewClient token={token} initialView={view} />;
}
