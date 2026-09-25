import { getDb } from "@/lib/db";
import { getLogger } from "@/lib/logger";

export async function GET() {
  const logger = getLogger();
  const started = performance.now();

  try {
    await getDb().$queryRaw`SELECT 1`;
    const durationMs = Math.round(performance.now() - started);
    logger.info({ route: "/api/health", db: "ok", durationMs }, "health check ok");
    return Response.json({ status: "ok", db: "ok" });
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    logger.error({ route: "/api/health", db: "error", durationMs, err }, "health check failed");
    return Response.json({ status: "error", db: "error" }, { status: 503 });
  }
}
