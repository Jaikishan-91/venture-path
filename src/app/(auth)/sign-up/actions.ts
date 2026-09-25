"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getLogger } from "@/lib/logger";
import { signupRoleSchema } from "@/lib/roles";
import { assignInitialRole } from "@/lib/user-roles";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: signupRoleSchema,
});

export type SignUpState =
  { status: "idle" } | { status: "error"; message: string } | { status: "sent"; email: string };

export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const { name, email, password, role } = parsed.data;

  try {
    const result = await getAuth().api.signUpEmail({
      body: { name, email, password, callbackURL: "/dashboard" },
      headers: await headers(),
    });
    // For an already-registered email Better Auth returns a placeholder user, so this is a no-op.
    await assignInitialRole(result.user.id, role);
  } catch (err) {
    if (err instanceof APIError) {
      return { status: "error", message: err.message };
    }
    getLogger().error({ err }, "sign-up failed");
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  return { status: "sent", email };
}
