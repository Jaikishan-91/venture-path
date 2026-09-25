# Implementation Plan

Status: shipped

Objective: Restyle VenturePath as a calm careers portal inspired by careers.pristineforests.com, without changing routes, form behavior, or accessible names tests rely on.

Current State: Default shadcn zinc tokens, Geist only, and a single narrow column on every page.

Desired State: Forest-green and cream tokens, Newsreader headlines, a public frame for home, browse, detail, auth, and role choice, and a sidebar shell for student, MSME, and admin pages.

Files to change:
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/site-header.tsx`
- `src/components/site-footer.tsx`
- `src/components/public-frame.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/role-home.tsx`
- `src/app/page.tsx`
- `src/app/opportunities/page.tsx`
- `src/app/opportunities/[id]/page.tsx`
- `src/app/(auth)/layout.tsx`
- `src/app/onboarding/role/page.tsx`
- `docs/CHANGELOG.md`
- `plan/README.md`
