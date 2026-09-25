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
| `signUp` | `src/app/(auth)/sign-up/actions.ts` | none | Bound to the page's role (`/sign-up` → `user`, `/organisation/sign-up` → `organisation`). Validates name, email, password (8–128); calls `auth.api.signUpEmail`; assigns the role. Always answers "check your inbox" for a valid form, including for already-registered emails. |
| `signInAs` | `src/app/(auth)/sign-in/actions.ts` | none | Bound to the page's role. Checks the password first (`Invalid email or password.`), then refuses an account of another role, deletes that new session and clears its cookies, and names the right sign-in page. An account without a role takes the page's role (never admin). Unverified emails get a new verification link (ADR-026). |
| `chooseRole` | `src/app/onboarding/role/actions.ts` | session | Sets the role of a user who has none. Never overwrites a role. |
| `saveUserProfileAction` | `src/app/user/profile/actions.ts` | `user` | Validates and upserts the signed-in user's profile; redirects to `/user`. |
| `reviewOrganisationAction` | `src/app/admin/organisations/actions.ts` | `admin` | Approves or rejects (reason required) an organisation profile from any status; refused if the profile changed since the page loaded. Emails the organisation. |
| `saveOpportunityAction` | `src/app/organisation/opportunities/actions.ts` | `organisation` (approved) | Validates and creates (as draft) or updates the organisation's own listing and its screening questions (max 8, 5–300 characters). Questions are ignored when locked, and refused (`questions_locked`) if they changed after someone applied. A new listing is then sent to the listing assist (ADR-032); if it added skills or questions the organisation lands on the edit page to review them, otherwise on `/organisation/opportunities`. |
| `assistOpportunityAction` | `src/app/organisation/opportunities/actions.ts` | `organisation` | "Suggest with AI" on the edit page: merges AI skills into the organisation's own listing and drafts questions when it has none and nobody has applied. |
| `applyAction` | `src/app/opportunities/[id]/actions.ts` | `user` | Applies (or reapplies after withdrawal) with a library resume (`resumeChoice=<id>`) or a new upload (`resumeChoice=upload`, added to the library), one `answer:<questionId>` per screening question (all required, max 2000 characters), and an optional note. |
| `uploadResumeAction` | `src/app/user/resumes/actions.ts` | `user` | Adds a resume (PDF, DOC, DOCX, max 5 MB) to the user's library, max 5 (ADR-031). Skills are extracted in the background. |
| `manageResumeAction` | `src/app/user/resumes/actions.ts` | `user` | `intent=rename`, `delete` or `retry` (skill extraction) on the user's own library resume. Delete keeps the file while an application uses it. |
| `withdrawAction` | `src/app/opportunities/[id]/actions.ts` | `user` | Withdraws the user's own submitted application. |
| `decideAction` | `src/app/organisation/opportunities/[id]/applicants/actions.ts` | `organisation` | Accepts or rejects a submitted application on the organisation's own listing. |
| `reanalyzeAction` | `src/app/organisation/opportunities/[id]/applicants/actions.ts` | `organisation` | Runs the screening analysis (resume and answers) again for an application on the organisation's own listing (ADR-024, ADR-033). Errors if no LLM is configured or nothing could be scored. |
| `savePromptAction` | `src/app/admin/settings/actions.ts` | `admin` | Saves an LLM prompt template (`resume_analysis`, `listing_assist`, `resume_skills`, `answer_scoring`, `job_description`; max 10,000 characters). |
| `opportunityStatusAction` | `src/app/organisation/opportunities/actions.ts` | `organisation` | `publish`, `close`, `reopen` or `delete` (drafts) on the organisation's own listing (ADR-020). |
| `saveOrganisationProfileAction` | `src/app/organisation/profile/actions.ts` | `organisation` | Validates and saves the signed-in organisation's profile; the status is derived on the server (ADR-016). Redirects to `/organisation`, or asks to save again if the status changed concurrently. |

## Pages and access

| Path | Access |
|------|--------|
| `/`, `/sign-in`, `/sign-up` | Public. User sign-in and sign-up (signed-in users are sent to `/dashboard`). |
| `/organisation/sign-in`, `/organisation/sign-up` | Public. Organisation sign-in and sign-up. |
| `/admin/sign-in` | Public. Admin sign-in (email and password only; no sign-up). |
| `GET /auth/continue?as=user\|organisation` | After Google sign-in: gives a new account that role; signs out an account of another role and returns to that sign-in page with `?error=wrong-role`. |
| `/student/*`, `/msme/*`, `/admin/msmes` | Permanent redirects to `/user/*`, `/organisation/*`, `/admin/organisations` (ADR-025). |
| `/dashboard` | Signed in; redirects to the user's home |
| `/onboarding/role` | Signed in without a role |
| `/user`, `/organisation`, `/admin` | Signed in with that role; other roles are redirected to their own home |
| `/user/profile`, `/organisation/profile` | Signed in with that role; create or edit own profile |
| `/opportunities`, `/opportunities/[id]` | Public. Search and detail. Users apply here (library resume or upload, answers to the screening questions, optional note). |
| `/user/applications` | User; own applications and, once accepted, the organisation email. Never shows scores. |
| `/user/resumes` | User; resume library (upload, rename, delete, retry skill extraction) with extracted skills. |
| `/user/recommendations` | User; up to 30 recommended listings with match % and matched skills (ADR-033). |
| `/organisation/opportunities/[id]/applicants?minScore=50\|70\|85&applied=24h\|7d\|30d\|custom&from=&to=&sort=score\|newest\|oldest` | Owning organisation; accept or reject, and see each applicant's overall, resume and answer scores, answers with per-answer scores, summary, and matched and missing skills. Filters by minimum overall score and apply time (India-time days for `custom`); invalid values fall back to defaults. User email shown only after acceptance. |
| `/admin/settings` | Admin; edit LLM prompt templates. |
| `GET /api/applications/[id]/resume` | User owner or owning organisation; 401 signed out, 404 otherwise. |
| `GET /api/resumes/[id]` | The user who owns the library resume; 401 signed out, 404 otherwise. |
| `/organisation/opportunities`, `/organisation/opportunities/new`, `/organisation/opportunities/[id]/edit` | Organisation; own listings only (other IDs give 404); forms only for approved organisations |
| `/admin/organisations?status=pending\|approved\|rejected` | Admin; organisation review list (default `pending`, max 100 per status) |

`src/proxy.ts` redirects requests without a session cookie to the sign-in page of that area (`/organisation/*` → `/organisation/sign-in`, `/admin/*` → `/admin/sign-in`, otherwise `/sign-in`); the sign-in and sign-up pages themselves pass through. It is only an optimisation; each page checks the session and role on the server (`src/lib/authz.ts`).
