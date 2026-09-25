# Requirements

Status: Initial high-level requirements from the product owner (2026-09-25). Details to be refined via `/grill-me` during initial planning. Items marked TBD are not yet decided and must not be assumed.

## Users

- **Students** — looking for freelance work and internships.
- **MSMEs** — businesses posting freelance work and internships.
- **Admin** — approves MSMEs before their listings go live (ADR-006). Other moderation duties: TBD.

## Verification (ADR-006)

- All users must verify their email address.
- An MSME's listings stay hidden from students until an admin approves that MSME.

## Sign-in (ADR-007)

- Email and password, with email verification.
- "Sign in with Google" (Google-verified emails count as verified).

## MVP Scope (decided 2026-09-25, ADR-004)

Discovery and application only: profiles, posting opportunities, search/browse, applying, and the MSME accepting or rejecting applications. Contact after acceptance happens outside the platform.

Out of MVP: in-app messaging, contracts/milestones, payments, reviews/ratings.

## Functional Requirements

- FR-1: Students and MSMEs can connect with each other on the platform.
- FR-2: MSMEs can post freelance work opportunities.
- FR-3: MSMEs can post internship opportunities.
- FR-4: Students can find (browse/search) freelance work and internships.
- FR-5: Only MSMEs create listings in the MVP. Students create a profile and apply to opportunities (ADR-005). Student service listings and a browsable student directory are out of MVP scope.
- TBD: application flow, messaging, verification of students/MSMEs, payments, reviews/ratings, notifications.

## Non-Functional Requirements

- NFR-1: Data stored in a proper relational database (PostgreSQL).
- NFR-2: Centralized application logging via Grafana Loki.
- TBD: performance targets, availability, scale, accessibility, localization, data privacy compliance.

## Constraints

See `docs/CONSTRAINTS.md`.
