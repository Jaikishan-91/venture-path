# Architecture

Status: Target architecture only — nothing is implemented yet. Update as components are built.

System Overview:
A Next.js web application backed by PostgreSQL, with application logs shipped to Grafana Loki.

Components:
- **Web app (Next.js)** — UI and server-side logic (route handlers / server actions). Exact structure TBD in initial plan.
- **Database (PostgreSQL)** — system of record for users, profiles, opportunities and applications.
- **Logging (Grafana Loki)** — receives structured application logs; viewed via Grafana. Shipping mechanism (e.g. log agent vs. direct push) TBD.

Data Flow:
User (browser) → Next.js (UI + server logic) → PostgreSQL
Next.js → structured logs → Grafana Loki → Grafana

Open architecture decisions (record in `docs/DECISIONS.md` when made):
- TypeScript vs. JavaScript.
- ORM / query layer.
- Authentication approach.
- Hosting / deployment target.
- Log shipping approach to Loki.
