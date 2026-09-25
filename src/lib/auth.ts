import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import { sendEmail } from "./email";
import { getEnv } from "./env";
import { getLogger } from "./logger";
import { ROLES } from "./roles";

function createAuth() {
  const env = getEnv();
  const logger = getLogger();

  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {};

  return betterAuth({
    appName: "VenturePath",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    user: {
      additionalFields: {
        role: {
          type: [...ROLES],
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Not awaited, so response timing doesn't reveal whether an email was sent.
        void sendEmail({
          to: user.email,
          subject: "Verify your VenturePath email",
          text: `Welcome to VenturePath. Verify your email address by opening this link:\n\n${url}\n\nIf you didn't sign up, ignore this email.`,
        })
          .then(() => logger.info({ userId: user.id }, "verification email sent"))
          .catch((err) => logger.error({ userId: user.id, err }, "verification email failed"));
      },
    },
    socialProviders: google,
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            logger.info({ userId: user.id }, "user created");
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
