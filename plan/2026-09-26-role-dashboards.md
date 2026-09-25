# Implementation Plan — Role dashboards and navbars

Status: shipped

## Context

Each role's home page (`src/app/user/page.tsx`, `src/app/organisation/page.tsx`, `src/app/admin/page.tsx`) is a placeholder: a profile card or a single count. The user wants real dashboards with stats and quick actions for each role, and better navigation. The extras the user picked for v1: **all** the suggested ones (listed per role below). Anything else goes on the roadmap.

Workflow the user asked for: I write one brief per role, launch three **Sonnet** subagents in parallel (one per role), then act as the parent: review each agent's work, fix or send back issues, run the full verification, and update the docs.

## Constraints that shape the split

- The working tree has a lot of uncommitted work (the role rename etc.), so **no worktree isolation**, because a worktree starts from HEAD and would miss it. The agents share the tree and own **disjoint files**.
- Shared files (sidebar, shared dashboard components, docs, schema, package.json) are touched **only by the parent**, so agents never conflict.
- No new dependencies. No chart library: bars are CSS (a DECISIONS entry).
- No schema changes. Everything can be derived from the existing models (`Application.status`, `Opportunity.status/deadline/publishedAt`, `Analysis.score`, `User.role/createdAt`).
- Memory rules: every UI change must work on phone, tablet and desktop. Notifications are toasts (dashboards are read-only, so none are expected).
- One Postgres and one port-3000 dev server: agents run only their own vitest file plus `tsc`/`eslint`. **Agents don't start the dev server or run Playwright.** The parent runs E2E.

## Step 0 — Parent: shared foundation (before launching agents)

1. `src/components/dashboard/` (new, server-safe, no client JS):
   - `stat-tile.tsx`: `StatTile({ label, value, hint?, href?, tone?: "default" | "accent" | "warn" })`. White `rounded-2xl` tile using the app palette (`#26594a` accent, `#ecedef` border, `#4a4d53` text). The whole tile is a link when `href` is set.
   - `stat-grid.tsx`: `grid grid-cols-2 gap-3 md:grid-cols-4`.
   - `dashboard-section.tsx`: `DashboardSection({ title, action?: {href,label}, children })` plus an `EmptyState({ children })`.
   - `bar-list.tsx`: `BarList({ items: {label, value}[] })`, horizontal CSS bars with the value as text (accessible, no colour-only meaning).
   - `status-pill.tsx`: pill for Application/Opportunity/Organisation statuses (text label plus colour).
2. `src/lib/dashboard/dates.ts`: `daysAgo(n, now?)`, `indiaDateRange(days, now?)` (today to today+n as `Date`s, matching how `deadline` is stored; see `todayInIndia` and `isDeadlinePassed` in `src/lib/opportunity-schemas.ts`). Unit test: `tests/dashboard-dates.test.ts`.
3. Navbar (`src/components/app-sidebar.tsx`, `src/components/role-home.tsx`):
   - lucide icons per nav item (lucide-react is already a dependency).
   - User nav: Dashboard, **Explore jobs** (`/opportunities`), Applications, Profile.
   - Organisation nav: Dashboard, Listings, **New listing** (`/organisation/opportunities/new`), Profile.
   - Admin nav: Dashboard, Organisation reviews, Settings.
   - Identity block in the sidebar footer (name plus role label) above Sign out. `RoleHome` passes `name` through.
   - Mobile bar stays horizontally scrollable, with icons and labels; checked at 375px.
   - The NAV config stays a single typed array per role, so a later link is one line.
4. `npx tsc --noEmit` and lint before launching agents.

## Step 1 — Three Sonnet agents in parallel (`general-purpose`, `model: sonnet`)

Every brief includes: repo rules (read `CLAUDE.md` and `AGENTS.md` briefly, don't re-plan), the shared components from Step 0 and their props, the palette, the file-ownership rule, the verification commands, and the **report format**: files changed, queries added, test output pasted, deviations and open questions. Common rules:

- Data access goes in `src/lib/dashboard/<role>.ts` (`import "server-only"`, `getDb()` from `src/lib/db.ts`). Each file exports one `get<Role>Dashboard(userId)` that runs its queries with `Promise.all` and returns a typed object. Pure helpers are exported separately for unit tests.
- Every query is scoped to the session user's id (except admin). The page calls `requireRole(...)` from `src/lib/authz.ts`.
- The page stays a server component rendered inside `RoleHome` and keeps `metadata`.
- Tests: `tests/dashboard-<role>.test.ts`, following the integration pattern in `tests/organisation-review.test.ts` (random users under a unique `EMAIL_DOMAIN`, cleanup in `afterAll`). Plus `e2e/dashboard-<role>.spec.ts` using `e2e/helpers.ts`, written but **not run** by the agent.
- Verify with: `npx vitest run tests/dashboard-<role>.test.ts`, `npx tsc --noEmit`, `npx eslint <own files>`.
- Don't touch other files. If a shared change is needed, stop and report it.

### Agent A: User dashboard
Owns: `src/lib/dashboard/user.ts`, `src/app/user/page.tsx`, `src/app/user/_components/*` (if needed), `tests/dashboard-user.test.ts`, `e2e/dashboard-user.spec.ts`.
- **Stat tiles:** Applications (total), Under review (`submitted`), Accepted, Not selected (`rejected`), all linking to `/user/applications`. Use `groupBy` on status where `userProfile.userId = userId`.
- **Explore jobs CTA:** primary button to `/opportunities` with "N new this week". N counts visible opportunities (reuse `visibleOpportunityWhere()` from `src/lib/search.ts`) with `publishedAt >= daysAgo(7)`.
- **Profile completeness:** pure `profileCompleteness(profile | null) → { percent, missing: string[] }` over profile exists, skills ≥1, bio, links ≥1 (institution, course and graduation year are required by the schema). Meter plus missing items plus an edit link. Keeps today's "Create profile" card when there's no profile.
- **Recommended jobs (4):** when the profile has skills, `searchOpportunities({ q: skills.slice(0,10).join(", "), type:null, workMode:null, city:null, page:1 })` from `src/lib/search.ts`. Drop ones already applied to and take 4. When there are no skills, or search/embedding throws (catch and log via `getLogger`), fall back to the latest visible opportunities, labelled "Latest opportunities". The dashboard must never fail because of embeddings.
- **Closing soon:** visible opportunities with a deadline within 7 days (India dates), up to 5, deadline ascending, marked "Applied" when already applied.
- **Recent applications:** last 5 with `StatusPill`, organisation name and a link.
- Unit tests: `profileCompleteness` cases. Integration: status counts, the applied-exclusion in recommendations (with a stubbed search, or the fallback path), closing-soon window edges.

### Agent B: Organisation dashboard
Owns: `src/lib/dashboard/organisation.ts`, `src/app/organisation/page.tsx`, `src/app/organisation/_components/*`, `tests/dashboard-organisation.test.ts`, `e2e/dashboard-organisation.spec.ts`.
- No profile: keep the existing "Create your business profile" card. Keep the approval status box (`role="status"`, `STATUS_TEXT`) near the top in a compact form.
- **Stat tiles:** Published / Drafts / Closed listings, Active applicants (non-withdrawn), Awaiting decision (`submitted`, `tone="warn"` when >0), Accepted.
- **Avg AI match score:** `analysis.aggregate` (`_avg.score`, `_count`) scoped via `application.opportunity.organisationProfile.userId`. Shows "No analyses yet" when the count is 0.
- **Per-listing table:** each own listing (reuse the ownership pattern from `listOwnOpportunities` in `src/lib/opportunities.ts`) with a status pill, deadline, and applicant counts by status (`application.groupBy(['opportunityId','status'])`), linking to `/organisation/opportunities/[id]/applicants`. A table on md+ and stacked cards below md.
- **Recent applicants (5):** across own listings, not withdrawn, with applicant name, listing title, applied date, and AI score if present.
- **Closing soon:** own published listings with a deadline within 7 days.
- Quick actions: New listing, Edit profile.
- Tests: ownership isolation (another organisation's data never counts), counts, avg-score null case, closing-soon window.

### Agent C: Admin dashboard
Owns: `src/lib/dashboard/admin.ts`, `src/app/admin/page.tsx`, `src/app/admin/_components/*`, `tests/dashboard-admin.test.ts`, `e2e/dashboard-admin.spec.ts`.
- **Stat tiles:** Users (role=user), Organisations (total, with a pending hint, linking to `/admin/organisations`), Listings (published / total), Applications (total).
- **Organisations by status:** reuse `countOrganisationsByStatus()` from `src/lib/organisation-review.ts`.
- **Users by role:** `user.groupBy(['role'])`, with null shown as "No role yet".
- **Listings by status** and **Application outcomes:** `BarList`s.
- **Growth:** new users, organisations, listings (`createdAt`) and applications (`appliedAt`) in the last 7 and 30 days, as a small 4×2 table.
- **Review queue preview:** the 5 oldest pending organisations (`updatedAt asc`, same order as `listOrganisations`) with a "Review" link.
- **AI stats:** analyses count and average score, LLM provider `kind` and `model` from `getLlmConfig()` (`src/lib/llm/config.ts`). **Never render `apiKey` or `baseUrl`.**
- Tests: counts go up after inserting fixtures (compare deltas, because the DB is shared with other tests), growth-window edges, and a check that the AI stats object has no apiKey/baseUrl keys.

## Step 2 — Parent review and hardening

For each agent's report: read the full diff of its owned files (not only the report) against its brief. Check:
- scoping (no cross-tenant leaks)
- `requireRole`
- no secrets rendered
- query count and N+1
- `Promise.all`
- responsive layout at 375, 768 and 1280
- empty states
- accessible labels
- matches the existing code style

Fix small issues myself. Send larger ones back with `SendMessage` to the same agent. Then run everything:
- `npm run typecheck`, `npm run lint`, `npm test` (full suite)
- start the dev server and run `npx playwright test` (full suite, including the three new specs)
- Playwright screenshots of each dashboard at phone and desktop width, which I inspect

## Step 3 — Document and close (parent)

- `plan/2026-09-26-role-dashboards.md` (this plan, the agent briefs and the verification results) and a row in `plan/README.md`
- `docs/REQUIREMENTS.md`: dashboard FRs per role
- `docs/ARCHITECTURE.md`: `src/lib/dashboard/*`, shared dashboard components, "how to add a stat later"
- `docs/DECISIONS.md`: ADR for CSS bars over a chart lib, and recommendations via the existing semantic search with a fallback
- `docs/ROADMAP.md`: later items (trend charts, nav badges with counts, customisable widgets, "viewed" application status)
- `docs/CHANGELOG.md`
- No commit unless asked.

## Verification summary
Unit and integration: the three `tests/dashboard-*.test.ts` files plus `dashboard-dates` and the full `npm test`. E2E: three new specs plus the full existing Playwright suite. Visual: screenshots at 375px and 1280px per role. Static: typecheck and lint clean.

## 