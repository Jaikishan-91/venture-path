import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

const MAILPIT_URL = "http://localhost:8025";
export const E2E_EMAIL_DOMAIN = "e2e.venturepath.local";

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${randomUUID().slice(0, 8)}@${E2E_EMAIL_DOMAIN}`;

type MailpitSearch = { messages: { ID: string }[] };
type MailpitMessage = { Text: string };

/** Polls Mailpit for the newest email to `to` and returns the Better Auth verification link. */
export async function getVerificationLink(to: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await search.json()) as MailpitSearch;
    if (messages.length > 0) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      const { Text } = (await message.json()) as MailpitMessage;
      const link = Text.match(/https?:\/\/\S+\/api\/auth\/verify-email\S+/)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No verification email for ${to} within ${timeoutMs} ms`);
}

async function query(sql: string, params: unknown[]): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

/** Simulates a user without a role, such as a first-time Google sign-in. */
export async function clearRole(email: string): Promise<void> {
  await query(`UPDATE "user" SET role = NULL WHERE email = $1`, [email]);
}

export async function deleteE2eUsers(): Promise<void> {
  await query(`DELETE FROM "user" WHERE email LIKE $1`, [`%@${E2E_EMAIL_DOMAIN}`]);
}
