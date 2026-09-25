import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Sign up · VenturePath" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return <SignUpForm googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)} />;
}
