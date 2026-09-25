import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { SignUpForm } from "../../sign-up/sign-up-form";

export const metadata: Metadata = { title: "Organisation sign up · VenturePath" };

export default async function OrganisationSignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return <SignUpForm role="organisation" googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)} />;
}
