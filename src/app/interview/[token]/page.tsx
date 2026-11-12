import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InterviewFrame } from "@/components/interview/interview-frame";
import { getInterviewForStudent, isInterviewTokenShape } from "@/lib/ai-interview";
import { getSession } from "@/lib/authz";
import { InterviewClient } from "./interview-client";

export const metadata: Metadata = { title: "AI interview · VenturePath" };

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
        <section className="my-auto flex flex-col gap-3 py-10">
          <h1 className="font-heading text-2xl text-[#1b2a26]">Sign in as a student</h1>
          <p className="text-sm text-[#4a4d53]">
            This interview belongs to a student account. Sign out, then open the link again and sign
            in with the account you applied with.
          </p>
          <Link href="/dashboard" className="text-sm font-medium text-[#26594a] underline">
            Go to your dashboard
          </Link>
        </section>
      </InterviewFrame>
    );
  }
  const view = session
    ? await getInterviewForStudent(session.user.id, token)
    : ({ state: "not_found" } as const);
  return <InterviewClient token={token} initialView={view} />;
}
