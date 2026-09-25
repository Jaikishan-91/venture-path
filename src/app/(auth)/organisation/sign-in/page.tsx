import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { SignInForm } from "../../sign-in/sign-in-form";

export const metadata: Metadata = { title: "Organisation sign in · VenturePath" };

export default async function OrganisationSignInPage({
  searchParams,
}: PageProps<"/organisation/sign-in">) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <SignInForm
      role="organisation"
      googleEnabled={Boolean(getEnv().GOOGLE_CLIENT_ID)}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
