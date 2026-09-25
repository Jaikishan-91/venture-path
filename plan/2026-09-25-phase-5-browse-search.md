# Implementation Plan — Phase 5: Browse and search

Status: shipped (2026-09-25)
Date: 2026-09-25
Parent plan: `plan/2026-09-25-mvp-initial-plan.md`

## Objective

Anyone can browse visible listings, filter them, search them semantically (pgvector) with keyword boosting, and open a listing's detail page.

## Decisions (user, 2026-09-25)

1. Public: signed-out visitors can browse and view listings (applying in Phase 6 needs a student account).
2. Location: work-mode filter plus a dropdown of cities that currently have visible listings.
3. Search: pgvector semantic search, embeddings from a local open-source model (Transformers.js), hybrid with keyword matches.
4. Detail page `/opportunities/[id]`.
5. Extra filter: type (freelance / internship).
6. Default order without a query: newest published first.

## Verified Facts (2026-09-25)

- `pgvector/pgvector:0.8.6-pg18-trixie` is the official PostgreSQL 18 image with pgvector 0.8.6; data volume stays at `/var/lib/postgresql`.
- Current image is `postgres:18.6-alpine` (musl) with `en_US.utf8` libc collation; the pgvector image is Debian (glibc), whose collation differs, so text indexes must be rebuilt (`REINDEX DATABASE`) and the collation version refreshed after switching.
- `@huggingface/transformers` 4.3.0: `pipeline("feature-extraction", "onnx-community/all-MiniLM-L6-v2-ONNX")`, call with `{ pooling: "mean", normalize: true }` → 384-dim Float32Array. Models download on first use and are cached (`env.cacheDir`). Next.js needs it in `serverExternalPackages`.

## Design

- **Visibility rule** (one SQL fragment used by every public query): `opportunity.status = 'published'` AND MSME `status = 'approved'` AND (`deadline` IS NULL OR `deadline` >= today in Asia/Kolkata).
- **Embeddings** (`src/lib/embeddings.ts`): lazy singleton pipeline (kept on `globalThis` across hot reloads), cache in `.cache/models` (git-ignored). Listing text = title, type, skills, description. `Opportunity.embedding vector(384)` (Prisma `Unsupported`, written with raw SQL) plus an HNSW cosine index. Embedding is refreshed after every create/update; if it fails the save still succeeds (logged) and `npm run embeddings:backfill` fills missing ones.
- **Search** (`src/lib/search.ts`, raw SQL via `Prisma.sql`): filters (type, work mode, city case-insensitive) + visibility. With a query: score = cosine similarity + keyword bonus (title, skills, business name, description, case-insensitive substring); results need similarity above a threshold or a keyword match; ordered by score. Without a query: newest `publishedAt` first. 20 per page with `page` param. City options = distinct cities of visible listings.
- **Pages** (public): `/opportunities` (GET form: q, type, workMode, city; result cards link to detail; pagination), `/opportunities/[id]` (404 unless visible; shows listing and public business info — name, industry, location, website, description; never owner name/email). Links from the home page and student dashboard.
- **Logging:** search counts and timings, embedding refresh/failures; not query text.

## Blast Surface

New: migration (`CREATE EXTENSION vector`, column, index), `src/lib/embeddings.ts`, `src/lib/search.ts`, `src/lib/search-params.ts` (pure parsing), `src/app/opportunities/{page,[id]/page}.tsx`, `scripts/backfill-embeddings.ts`, tests, e2e.
Modified: `docker-compose.yml` (image), `prisma/schema.prisma`, `src/lib/opportunities.ts` (refresh embedding), `next.config.ts`, `.gitignore`, `package.json` (dependency, script), `src/app/page.tsx`, `src/app/student/page.tsx`, docs.

## Test Strategy

- Unit: search param parsing (invalid values ignored, page bounds).
- Integration (real model + Postgres): embedding is 384-dim and normalised; visibility (draft, pending MSME, passed deadline hidden); filters; city options; semantic match without shared words; keyword boost ranks exact matches first; unrelated query returns nothing from the test set.
- E2E: signed-out visitor searches, filters, opens a detail page; hidden listing's detail page is 404.

## Risks

- Image switch on existing data: reindex; dev data only. Rollback: revert the image line (the data directory format is the same major version) and reindex again.
- Model download needs internet on first use (~25 MB) and adds memory to the server process.
- Relevance threshold tuned on small data; revisit with real listings.

## Rollback

One commit; revert, restore the image, `prisma migrate reset` locally.

## Outcome (2026-09-25)

Deviations from the plan:
- Keyword weights are cast to `float8` in SQL. Postgres inferred `integer` from `ELSE 0` and rejected `0.3`.
- The schema has `@@index([embedding], map: "opportunity_embedding_idx")` so Prisma Migrate does not generate a `DROP INDEX` for the HNSW index it cannot represent. Verified with `migrate diff` (empty).
- After switching images, `REINDEX DATABASE` succeeded. `ALTER DATABASE ... REFRESH COLLATION VERSION` reported "invalid collation version change"; the stored collation version is null and existing rows were readable, so it was left as is.

Verification actually run:
- Model smoke test: 384 dimensions, unit length; related texts score about 0.33-0.43 and unrelated ones under 0.25, which set the 0.3 threshold.
- `npx prisma migrate dev` applied `search_embeddings`; extension `vector` 0.8.6 and the HNSW index are present.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`: pass.
- `npm test`: 12 files, 129 tests pass. `npm run test:e2e`: 24 tests pass. New coverage: parameter parsing; visibility including an unapproved MSME and a passed deadline; semantic match with no shared words; keyword ranking; type, work mode and city filters; city dropdown; a signed-out visitor searching, opening a listing, and getting 404 for a draft.

Not verified:
- Search quality beyond the four calibration listings. The 0.3 threshold should be revisited with real data.
- Pagination beyond one page, and the HNSW index under a large number of listings (sequential scan is what the tests hit).