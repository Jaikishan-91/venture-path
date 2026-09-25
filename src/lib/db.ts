import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

// pg defaults to no connection timeout, which would hang requests when the database is down.
const CONNECTION_TIMEOUT_MS = 5_000;

function createDb(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getEnv().DATABASE_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads so dev mode doesn't open a new connection pool per edit.
const globalForDb = globalThis as unknown as { db?: PrismaClient };

export function getDb(): PrismaClient {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
