# Implementation Plan

Status: shipped

Objective: Make `docker compose build next` succeed.

Current State: The builder fails `next build` because `src/app/admin/settings/page.tsx` puts `"use client"` mid-file and imports `useActionState` in a Server Component. After that, the runner would fail copying a missing `public/` directory and `node_modules/.prisma/client/prisma-client` (Prisma 7 writes the client to `src/generated/prisma`), and `chown` runs as the non-root `nextjs` user.

Desired State: `PromptEditor` is a client component. The runner copies only paths the builder produces, creates the model cache as root, then drops to `nextjs`. `docker compose build next` exits 0.

Files to change:
- `src/app/admin/settings/page.tsx`
- `src/app/admin/settings/prompt-editor.tsx` (new)
- `Dockerfile`
- `docs/CHANGELOG.md`
- `plan/README.md`
