# Architecture & Engineering Decisions

## ADR-001 — Core technology stack
Date: 2026-09-25
Context: Greenfield project; product owner specified preferred technologies.
Decision: Use Next.js for the application, PostgreSQL as the database, and Grafana Loki for logging.

## ADR-002 — Plans stored in `plan/`
Date: 2026-09-25
Context: Plans need to persist across agent sessions.
Decision: Every implementation plan is saved as a file in `plan/` (see `AGENTS.md` → Project Operating Rules).

## ADR-003 — Commit on every shipped feature
Date: 2026-09-25
Context: Product owner wants Git history updated as soon as features ship.
Decision: Git repository initialized; each feature is committed once it completes the five-pillar lifecycle (see `AGENTS.md` → Project Operating Rules).

## ADR-004 — MVP boundary: discovery and application only
Date: 2026-09-25
Context: The platform could stop at matching or also handle messaging, contracts and payments; that choice drives data model, security and legal scope.
Decision: MVP covers profiles, opportunity posting, search, applying, and accept/reject. Messaging, contracts, payments and reviews are out of MVP scope.

## ADR-005 — Only MSMEs post listings in MVP
Date: 2026-09-25
Context: "Post and find" could mean both sides post listings.
Decision: In the MVP only MSMEs post opportunities (freelance or internship). Students have profiles and apply. Student service listings and a student directory are deferred.

## ADR-006 — Email verification plus admin approval of MSMEs
Date: 2026-09-25
Context: Fake or scam listings aimed at students are the main trust risk.
Decision: Every user verifies their email. An admin role approves each MSME, and an MSME's listings are not visible to students until approval.

## ADR-007 — Sign-in with email/password and Google
Date: 2026-09-25
Context: Need a sign-in method that is familiar to students and supports email verification.
Decision: Support email and password (with email verification) and Google sign-in. Auth library: Better Auth (ADR-009).

## ADR-008 — Local Docker Compose first; production hosting deferred
Date: 2026-09-25
Context: No production hosting decision yet; want no cost or lock-in during MVP build.
Decision: Develop locally with Docker Compose running Next.js, PostgreSQL, Loki and Grafana. Production hosting will be decided later and recorded as a new ADR.

## ADR-009 — Application technical stack
Date: 2026-09-25
Context: Remaining technical choices after ADR-001.
Decision: TypeScript, Next.js App Router, Prisma ORM (PostgreSQL, Prisma Migrate), Better Auth (email/password + Google), Tailwind CSS with shadcn/ui, pino for structured logging shipped to Loki, Vitest for unit/integration tests and Playwright for end-to-end tests. Package manager: npm.

## ADR-010 — Pin Prisma 7.10.0; override two vulnerable CLI dependencies
Date: 2026-09-25
Context: npm's `latest` tag for `prisma` is `8.0.0-rc.17`, but Better Auth 1.7.6 declares `prisma ^5 || ^6 || ^7`. The Prisma 7.10.0 CLI pulls in `deepmerge-ts` 7.x (GHSA-ggr8-5vv4-36mx) and a vulnerable `mysql2`; npm's suggested fix was downgrading to Prisma 6.
Decision: Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to exactly 7.10.0. Add npm `overrides` for `mysql2 ^3.24.4` and `deepmerge-ts ^8.0.2`. Verified afterwards: `npm audit` reports 0 vulnerabilities, and `prisma validate` and `prisma generate` still work. Revisit when Better Auth supports Prisma 8.

## ADR-011 — Push logs directly to Loki with pino-loki
Date: 2026-09-25
Context: Logs could be shipped by an agent (Grafana Alloy/Promtail) or pushed by the app.
Decision: Use the `pino-loki` transport in a pino worker thread, with 2-second batching. No log agent is needed locally. Trade-off: logs buffered at shutdown or while Loki is unreachable can be lost; stdout still receives every line. Revisit for production hosting.

## ADR-012 — shadcn/ui default preset
Date: 2026-09-25
Context: shadcn/ui 4.21 offers several presets and component bases.
Decision: Use `shadcn init --defaults` (template `next`, preset `base-nova`, Base UI components). It installs the `cn` package (published by shadcn from `shadcn-ui/cn` with npm provenance) instead of `clsx` + `tailwind-merge`. `cn` is only weeks old; watch it for issues.

## ADR-013 — Role is server-owned, chosen once, never changed by users
Date: 2026-09-25
Context: Users pick student or MSME. Google sign-in has no role field. Letting clients write the role would allow self-promotion to admin (user decisions 1 and 2, Phase 1 plan).
Decision: `User.role` is a nullable enum declared to Better Auth with `input: false`, so no auth endpoint or OAuth profile can set it (Better Auth rejects it with 400). The only user-driven write is `assignInitialRole`: `student`/`msme` only, and only while the role is `null`. Email sign-up assigns it right after account creation; a user whose role is still `null` (e.g. first Google sign-in) is held on `/onboarding/role`. Admins are created only by the seed script. Changing a set role is admin-only and not built yet.

## ADR-014 — Email verification required before sign-in
Date: 2026-09-25
Context: ADR-006 requires verified emails; user decision 3 blocks unverified users entirely.
Decision: `requireEmailVerification: true`, `sendOnSignUp` and `sendOnSignIn` (a blocked sign-in re-sends the link), `autoSignInAfterVerification`. Sign-up returns the same "check your inbox" response for new and existing emails (no account enumeration). Email is sent without awaiting inside the Better Auth callback, as its docs advise. Local SMTP is Mailpit via nodemailer; production provider TBD.

## ADR-015 — Route protection in pages, proxy only as an optimisation
Date: 2026-09-25
Context: Next.js 16 renamed middleware to `proxy`. Better Auth docs say a cookie check there is not a security boundary.
Decision: `src/proxy.ts` redirects requests without a session cookie on protected paths. Every protected page and server action calls `requireSession`/`requireRole`, which validate the session against the database. Wrong-role users are redirected to their own home rather than shown a 403.
