import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicFrame } from "@/components/public-frame";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getInterviewForStudent, isInterviewTokenShape } from "@/lib/ai-interview";
import { getSession } from "@/lib/authz";
import { InterviewClient } from "./interview-client";

export const metadata: Metadata = { title: "AI interview · VenturePath" };

/** The student's AI interview from the emailed link (docs/PRODUCT.md Module 5). */
export default async function InterviewPage({ params }: PageProps<"/interview/[token]">) {
  const { token } = await params;
  const session = await getSession();
  if (!session && isInterviewTokenShape(token)) {
    redirect(`/sign-in?next=${encodeURIComponent(`/interview/${token}`)}`);
  }
  const wrongAccount = session && session.user.role !== "user";
  const view =
    session && !wrongAccount
      ? await getInterviewForStudent(session.user.id, token)
      : ({ state: "not_found" } as const);

  return (
    <PublicFrame>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6">
        <Card className="w-full max-w-xl">
          {wrongAccount ? (
            <CardHeader>
              <CardTitle>Sign in as a student</CardTitle>
              <CardDescription>
                This interview belongs to a student account. Sign out, then open the link again and
                sign in with the account you applied with.{" "}
                <Link href="/dashboard" className="underline">
                  Go to your dashboard
                </Link>
              </CardDescription>
            </CardHeader>
          ) : (
            <InterviewClient token={token} initialView={view} />
          )}
        </Card>
      </main>
    </PublicFrame>
  );
}
