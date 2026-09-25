# API

## Endpoints

### `GET /api/health`

Checks that the app can reach the database (`SELECT 1`). No authentication.

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{"status":"ok","db":"ok"}` | Database reachable |
| 503 | `{"status":"error","db":"error"}` | Database unreachable; details are logged, not returned |

### `GET|POST /api/auth/*`

Better Auth 1.7.6 handler (`src/app/api/auth/[...all]/route.ts`). The UI uses it through `authClient` (`src/lib/auth-client.ts`). Endpoints used by the app:

| Endpoint | Used for |
|----------|----------|
| `POST /api/auth/sign-in/email` | Email/password sign-in. 403 if the email isn't verified (a new verification email is sent). |
| `POST /api/auth/sign-in/social` | Google sign-in (only when Google credentials are configured). |
| `POST /api/auth/send-verification-email` | "Resend verification email". |
| `GET /api/auth/verify-email?token=…` | Link in the verification email; verifies, signs in, redirects to `/dashboard`. |
| `POST /api/auth/sign-out` | Sign out. |
| `GET /api/auth/get-session` | Current session (client). |

`role` can't be set through any auth endpoint: it is declared `input: false`, and Better Auth rejects it with 400.

## Server actions

| Action | File | Auth | Behaviour |
|--------|------|------|-----------|
| `signUp` | `src/app/(auth)/sign-up/actions.ts` | none | Validates name, email, password (8–128), role (`student`/`msme`); calls `auth.api.signUpEmail`; assigns the role. Always answers "check your inbox" for a valid form, including for already-registered emails. |
| `chooseRole` | `src/app/onboarding/role/actions.ts` | session | Sets the role of a user who has none. Never overwrites a role. |

## Pages and access

| Path | Access |
|------|--------|
| `/`, `/sign-in`, `/sign-up` | Public (signed-in users are sent from sign-in/up to `/dashboard`) |
| `/dashboard` | Signed in; redirects to the user's home |
| `/onboarding/role` | Signed in without a role |
| `/student`, `/msme`, `/admin` | Signed in with that role; other roles are redirected to their own home |

`src/proxy.ts` redirects requests without a session cookie to `/sign-in`. It is only an optimisation; each page checks the session and role on the server (`src/lib/authz.ts`).
