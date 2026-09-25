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
- TBD: application flow, messaging, verification of users/organisations, payments, reviews/ratings, notifications.

## Non-Functional Requirements

- NFR-1: Data stored in a proper relational database (PostgreSQL).
- NFR-2: Centralized application logging via Grafana Loki.
- NFR-3 (2026-09-26): All alerts and notifications in the UI are shown as toast notifications themed to match the app (ADR-027).
- NFR-4 (2026-09-26): Every page works on mobile, tablet and desktop.
- TBD: performance targets, availability, scale, accessibility, localization, data privacy compliance.

## Constraints

See `docs/CONSTRAINTS.md`.
