import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

loadEnvConfig(process.cwd());

const MAILPIT_URL = "http://localhost:8025";
export const E2E_EMAIL_DOMAIN = "e2e.venturepath.local";
export const PASSWORD = "correct-horse-battery";

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${randomUUID().slice(0, 8)}@${E2E_EMAIL_DOMAIN}`;

export async function signUp(page: Page, role: "student" | "msme", email: string) {
  await page.goto("/sign-up");
  await page.getByLabel(role === "student" ? "A student" : "An MSME (business)").check();
  await page.getByLabel("Name").fill(`E2E ${role}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
}

/** Signs up, verifies the email and lands on the role's dashboard. */
export async function signUpVerified(page: Page, role: "student" | "msme", email: string) {
  await signUp(page, role, email);
  await page.goto(await getVerificationLink(email));
  await expect(page).toHaveURL(new RegExp(`/${role}$`), { timeout: 15_000 });
}

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

/** Stands in for the admin review that arrives in Phase 3. */
export async function setMsmeStatus(email: string, status: "approved" | "rejected"): Promise<void> {
  await query(
    `UPDATE msme_profile SET status = $2 WHERE "userId" = (SELECT id FROM "user" WHERE email = $1)`,
    [email, status],
  );
}

export async function deleteE2eUsers(): Promise<void> {
  await query(`DELETE FROM "user" WHERE email LIKE $1`, [`%@${E2E_EMAIL_DOMAIN}`]);
}
