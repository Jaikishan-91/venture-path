# Requirements

Status: Initial high-level requirements from the product owner (2026-09-25). Details to be refined via `/grill-me` during initial planning. Items marked TBD are not yet decided and must not be assumed.

## Users

- **Users** — looking for freelance work and internships.
- **Organisations** — businesses posting freelance work and internships.
- **Admin** — approves organisations before their listings go live (ADR-006). Other moderation duties: TBD.

## Verification (ADR-006)

- All users must verify their email address.
- An organisation's listings stay hidden from users until an admin approves that organisation.

## Sign-in (ADR-007)

- Email and password, with email verification.
- "Sign in with Google" (Google-verified emails count as verified).

## MVP Scope (decided 2026-09-25, ADR-004)

Discovery and application only: profiles, posting opportunities, search/browse, applying, and the organisation accepting or rejecting applications. Contact after acceptance happens outside the platform.

Out of MVP: in-app messaging, contracts/milestones, payments, reviews/ratings.

## Functional Requirements

- FR-1: Users and organisations can connect with each other on the platform.
- FR-2: Organisations can post freelance work opportunities.
- FR-3: Organisations can post internship opportunities.
- FR-4: Users can find (browse/search) freelance work and internships.
- FR-5: Only organisations create listings in the MVP. Users create a profile and apply to opportunities (ADR-005). User service listings and a browsable user directory are out of MVP scope.
- FR-6: Users and organisations have separate sign-in and sign-up pages; the admin has a sign-in page only (admins are created by the seed script). Each sign-in page accepts only its own account type (ADR-026).
- FR-7 (2026-09-26): Each role has a dashboard as its home page, with role-specific navigation.
  - User: application counts (total, under review, accepted, not selected), an "Explore jobs" call to action with jobs new this week, profile completeness, recommended jobs from their skills (latest jobs as a fallback), jobs closing within 7 days, and recent applications.
  - Organisation: approval status, listing counts by status, applicant counts, average AI match score, a per-listing applicant table, recent applicants, and own listings closing within 7 days.
  - Admin: counts of users, organisations, listings and applications; the 5 oldest pending organisations; breakdowns by role and status; growth over 7 and 30 days; AI analysis count, average score and provider.
- FR-8 (2026-09-26): A user keeps up to 5 resumes in a library and picks one (or uploads a new one) for each application. The LLM extracts skills from each uploaded resume (ADR-031).
- FR-9 (2026-09-26): When an organisation creates a listing, the LLM extracts its required skills and drafts screening questions; the organisation edits them before publishing. Questions lock once someone applies (ADR-032).
- FR-10 (2026-09-26): Jobs are recommended to users from their resume skills (profile skills as a fallback) matched against each listing's required skills (ADR-033).
- FR-11 (2026-09-26): Applying requires answering every screening question. The LLM scores the resume against the listing's skills and requirements and scores the answers; organisations see resume, answer and overall scores and filter applicants by minimum score and apply time. Users never see scores (ADR-033).
- TBD: application flow, messaging, verification of users/organisations, payments, reviews/ratings, notifications.

## Non-Functional Requirements

- NFR-1: Data stored in a proper relational database (PostgreSQL).
- NFR-2: Centralized application logging via Grafana Loki.
- NFR-3 (2026-09-26): All alerts and notifications in the UI are shown as toast notifications themed to match the app (ADR-027).
- NFR-4 (2026-09-26): Every page works on mobile, tablet and desktop.
- TBD: performance targets, availability, scale, accessibility, localization, data privacy compliance.

## Constraints

See `docs/CONSTRAINTS.md`.
