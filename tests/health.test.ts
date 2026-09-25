import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { getDb } from "@/lib/db";

// Integration test: needs the Docker Postgres from docker-compose.yml.
describe("GET /api/health", () => {
  afterAll(async () => {
    await getDb().$disconnect();
  });

  it("returns 200 when the database is reachable", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", db: "ok" });
  });
});
