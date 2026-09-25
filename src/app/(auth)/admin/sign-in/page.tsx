import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/authz";
import { SignInForm } from "../../sign-in/sign-in-form";

export const metadata: Metadata = { title: "Admin sign in · VenturePath" };

export default async function AdminSignInPage() {
  if (await getSession()) redirect("/dashboard");
  return <SignInForm role="admin" googleEnabled={false} />;
}
