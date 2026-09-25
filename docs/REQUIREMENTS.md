# Requirements

Status: Initial high-level requirements from the product owner (2026-09-25). Details to be refined via `/grill-me` during initial planning. Items marked TBD are not yet decided and must not be assumed.

## Users

- **Students** — looking for freelance work and internships.
- **MSMEs** — businesses posting freelance work and internships.
- Admin/moderation role: TBD.

## Functional Requirements

- FR-1: Students and MSMEs can connect with each other on the platform.
- FR-2: MSMEs can post freelance work opportunities.
- FR-3: MSMEs can post internship opportunities.
- FR-4: Students can find (browse/search) freelance work and internships.
- FR-5: Students can post/advertise their availability or services (interpreted from "post and find" — TBD, confirm).
- TBD: application flow, messaging, verification of students/MSMEs, payments, reviews/ratings, notifications.

## Non-Functional Requirements

- NFR-1: Data stored in a proper relational database (PostgreSQL).
- NFR-2: Centralized application logging via Grafana Loki.
- TBD: performance targets, availability, scale, accessibility, localization, data privacy compliance.

## Constraints

See `docs/CONSTRAINTS.md`.
