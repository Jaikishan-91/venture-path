import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { SignInForm } from "../../sign-in/sign-in-form";

export const metadata: Metadata = { title: "Hiring manager sign in · VenturePath" };

export default async function HiringManagerSignInPage({
  searchParams,
}: PageProps<"/hiring-manager/sign-in">) {
  if (await getSession()) redirect("/dashboard");
  const { error, invite } = await searchParams;
  return (
    <SignInForm
      role="hiring_manager"
      googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
      error={typeof error === "string" ? error : undefined}
      inviteToken={typeof invite === "string" ? invite : undefined}
    />
  );
}
