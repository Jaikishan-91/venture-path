# Implementation Plan — Toast notifications; live-reloading Docker dev

Status: shipped (pending one image rebuild; see Verification)

## Objective

1. Show every alert and notification as a toast themed to the app (NFR-3), usable on phones, tablets and desktops (NFR-4).
2. Run the app in Docker so code changes show up live, without rebuilding the image.

## Current state

- Eleven forms show a `role="alert"` error paragraph from `useActionState`. Successful actions show nothing; most redirect (`saveUserProfileAction`, `saveOrganisationProfileAction`, `saveOpportunityAction`, `signInAs`, `chooseRole`) or return nothing (`decideAction`, `withdrawAction`). Sign-in shows `?error=google|wrong-role` inline.
- Two `role="status"` boxes (organisation review status, listings not approved) are persistent page state, not notifications. They stay inline.
- Docker has one `next` service: a production standalone image. Any code change needs `docker compose build`.

## Design

Toasts: `sonner` 2.0.8 (the library behind shadcn/ui's toast; one small dependency, React 19 compatible, announces through an `aria-live` region).
- `src/components/app-toaster.tsx` (client): `<Toaster>` styled with the app tokens (card background, forest-green `--primary` for success, `--destructive` for errors, `--radius`, Geist font), a close button, top-centre on phones and bottom-right from `sm`, full width minus the gutters on phones. Rendered once in the root layout.
- Errors: `useActionErrorToast(state)` shows `toast.error(state.message)` each time an action returns a new error state. Inline error paragraphs are removed.
- Success, and outcomes of actions that return nothing: `flash(type, message)` in `src/lib/flash.ts` sets a short-lived `vp-flash` cookie in the server action. The root layout reads it and passes it to `AppToaster`, which shows it once (deduplicated by id) and deletes the cookie. This works after both `redirect()` and `revalidatePath()`.
- Query-string errors on the sign-in pages become toasts.
- The sign-up "Check your inbox" card stays, because it is the page's content; resend success or failure becomes a toast.

Docker dev (Docker's recommended approach; the Next.js docs advise against polling):
- Dockerfile: new `dev` stage (`npm ci`, source copied, `npm run dev`, i.e. nodemon + `next dev`).
- Compose: new `next-dev` service (profile `dev`) with `develop.watch`. Compose watches files on the host and syncs them into the container, so Turbopack sees normal file events and hot-reloads:
  - `src/`, `prisma/`, `.env`, `next.config.ts`, `prisma7.config.ts`: `sync`. nodemon restarts for schema, config and `.env` changes.
  - `package.json`, `package-lock.json`: `rebuild`.
- The production `next` service moves to profile `prod`, so the two can't both claim port 3000. `docker compose up -d` starts only the backing services.
- npm scripts: `docker:dev` (`docker compose --profile dev up --build --watch next-dev`) and `docker:prod`.
- Named volumes for `uploads` and the model cache in dev.

## Files

Change: `package.json`, `src/app/layout.tsx`, all eleven forms, the six action files above plus `reviewOrganisationAction`, `savePromptAction`, `reanalyzeAction`, `opportunityStatusAction`, `applyAction`, `signUp`; `Dockerfile`, `docker-compose.yml`, `.dockerignore` (keep `.env` out of the image), `README.md`, e2e specs that assert `role="alert"`, docs.
New: `src/components/app-toaster.tsx`, `src/components/use-action-error-toast.ts`, `src/lib/flash.ts`, `tests/flash.test.ts`, `e2e/helpers.ts` `toast()` locator.

## Tests

Unit: flash cookie encode/parse. E2E: existing specs switch from inline alerts to toasts; new checks for a success toast after a redirect (profile saved), a toast after a return-nothing action (accept), and toasts at phone width. Docker: start the `dev` profile, edit a file, and confirm the served HTML changes without a rebuild.

## Risks

- A flash cookie set in an action that neither redirects nor revalidates would only show on the next navigation; every mutating action here does one or the other.
- File sync crosses the Docker Desktop VM boundary, so a change takes a moment longer to show than with `npm run dev` on the host.

## Verification (2026-09-26)

- `npm run typecheck`, `npm run lint`: pass. `npm test`: 18 files, 165 tests pass.
- Playwright on the host dev server: 29/29 pass (2 workers), including the success toast after a redirect, the toast after an in-place action, and the phone-width checks.
- Screenshots (desktop and iPhone 13 size): success and error toasts use the app palette and stay on screen.
- Docker dev: `npm run docker:dev` builds and starts; an edit to `src/components/site-footer.tsx` on the host was served by the container 3 s later, and the revert synced too. Playwright against the container: 28/29 in parallel; the remaining one (applicants page first compile) passed on re-run.
- Found and fixed: embeddings failed in every Docker image (Alpine/musl vs. glibc `onnxruntime-node`); base switched to `node:22-bookworm-slim`.
- Not verified yet: the image with the OpenSSL line, and the production image on the new base. Both rebuilds failed because Docker Hub timed out from this network (`registry-1.docker.io ... context deadline exceeded`). The running dev container uses the Debian image built before that change; Prisma logs an OpenSSL warning until it is rebuilt.
