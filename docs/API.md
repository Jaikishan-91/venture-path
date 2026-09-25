# API

## Endpoints

### `GET /api/health`

Checks that the app can reach the database (`SELECT 1`). No authentication.

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{"status":"ok","db":"ok"}` | Database reachable |
| 503 | `{"status":"error","db":"error"}` | Database unreachable; details are logged, not returned |

## Authentication

Not implemented yet (Phase 1: Better Auth, ADR-007).
