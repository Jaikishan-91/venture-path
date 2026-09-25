import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · VenturePath" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <SignInForm
      googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
      googleFailed={error === "google"}
    />
  );
}
