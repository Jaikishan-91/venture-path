import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/ai-interview-schemas";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Venture Path" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { error, next } = await searchParams;
  const nextPath = safeNextPath(next);
  if (await getSession()) redirect(nextPath ?? "/dashboard");
  return (
    <SignInForm
      role="user"
      googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
      error={typeof error === "string" ? error : undefined}
      nextPath={nextPath ?? undefined}
    />
  );
}
