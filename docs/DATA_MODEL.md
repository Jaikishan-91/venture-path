# Data Model

Source of truth: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

## Implemented (Phase 1)

Auth tables follow Better Auth's core schema (generated with `npx auth@1.7.6 generate`). Table names are lowercase (`@@map`).

| Model | Table | Notes |
|-------|-------|-------|
| `User` | `user` | `email` unique, `emailVerified`, `role` (`Role?`). |
| `Session` | `session` | `token` unique; cascades on user delete. |
| `Account` | `account` | One per sign-in method. Email/password uses `providerId = "credential"` with the password hash; Google uses `providerId = "google"`. Cascades on user delete. |
| `Verification` | `verification` | Email verification tokens. |

`Role` enum: `student`, `msme`, `admin`.

Role rules:
- `role` is `null` until chosen. A user without a role can only reach `/onboarding/role`.
- Only `assignInitialRole` (`src/lib/user-roles.ts`) writes it from user input: `student` or `msme` only, and only while it is `null`.
- `admin` is only created by `npm run db:seed`.

## Planned (Phases 2–6)

- StudentProfile, MsmeProfile (with approval status), Opportunity (freelance | internship), Application. See `plan/2026-09-25-mvp-initial-plan.md`.
- User 1–1 StudentProfile or MsmeProfile (by role); MsmeProfile 1–N Opportunity; StudentProfile N–N Opportunity via Application.
