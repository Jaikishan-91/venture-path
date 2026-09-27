import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { getEnv } from "../src/lib/env";

/**
 * One-time operator script (ADR-035): obtains the refresh token for the platform Google account
 * that creates every interview event and Meet link. Run with `npm run google:calendar-token`.
 *
 * This does NOT write `.env` for you — copy the printed refresh token in yourself.
 */

const REDIRECT_URI = "http://localhost:53682/oauth2callback";
const PORT = 53682;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function printPrerequisites(): void {
  console.log(
    [
      "Before running this script, in the Google Cloud project that owns GOOGLE_CLIENT_ID:",
      `  1. OAuth client > Authorized redirect URIs: add ${REDIRECT_URI}`,
      "  2. APIs & Services > Library: enable the Google Calendar API.",
      "  3. APIs & Services > OAuth consent screen > Data access: add the scope",
      `     ${SCOPE}`,
      "  4. Either add the platform Google account as a Test user (publishing status",
      "     'Testing'), or publish the app to 'In production' (unverified is fine for a single",
      "     platform account — you'll see a one-time 'Google hasn't verified this app' warning).",
      "",
      "  Note: a refresh token issued while the app is in 'Testing' status expires after 7 days",
      "  (you'd need to re-run this script weekly). 'In production', even unverified, does not",
      "  have that 7-day expiry. Prefer 'In production' for anything beyond a quick trial.",
      "",
    ].join("\n"),
  );
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string,
): Promise<{
  refresh_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
}

async function main(): Promise<void> {
  printPrerequisites();

  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set in .env first.");
    process.exit(1);
  }
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  const state = base64url(randomBytes(16));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log(
    "Sign in with the PLATFORM Google account (a dedicated Gmail, not a personal one), then open:\n",
  );
  console.log(authUrl.toString());
  console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...`);

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }

      const done = (statusMessage: string, ok: boolean) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<html><body><p>${statusMessage} You can close this tab and return to the terminal.</p></body></html>`,
        );
        server.close();
        if (ok) resolve();
        else reject(new Error(statusMessage));
      };

      const error = url.searchParams.get("error");
      if (error) {
        done(`Google returned an error: ${error}.`, false);
        return;
      }

      const returnedState = url.searchParams.get("state");
      if (returnedState !== state) {
        done("State mismatch — possible request forgery. Aborting.", false);
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        done("No authorization code in the callback.", false);
        return;
      }

      // Exchange, then finish the response — run after we've replied to keep the browser tab tidy.
      exchangeCodeForTokens(clientId, clientSecret, code, codeVerifier)
        .then((tokens) => {
          if (tokens.error || !tokens.refresh_token) {
            console.error(
              `\nToken exchange failed: ${tokens.error ?? "no refresh_token in response"}` +
                (tokens.error_description ? ` (${tokens.error_description})` : ""),
            );
            if (!tokens.error && !tokens.refresh_token) {
              console.error(
                "Google only issues a refresh token on the first consent (or with prompt=consent, " +
                  "every time). If you still didn't get one, revoke the app's access at " +
                  "https://myaccount.google.com/permissions and run this script again.",
              );
            }
            done("Token exchange failed — see the terminal for details.", false);
            return;
          }
          console.log("\nSuccess. Add this to .env:\n");
          console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tokens.refresh_token}`);
          console.log("\n(This script does not write .env for you.)");
          done("Success!", true);
        })
        .catch((err: unknown) => {
          console.error("\nToken exchange request failed:", err);
          done("Token exchange request failed — see the terminal for details.", false);
        });
    });

    server.listen(PORT, "127.0.0.1");
  });

  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
