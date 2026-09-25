import pino, { type Logger, type TransportTargetOptions } from "pino";
import { getEnv } from "./env";

const APP_NAME = "venturepath";

const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

function createLogger(): Logger {
  const env = getEnv();
  const level = env.LOG_LEVEL;

  const targets: TransportTargetOptions[] = [
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", level, options: { colorize: true } }
      : { target: "pino/file", level, options: { destination: 1 } },
  ];

  if (env.LOKI_URL) {
    targets.push({
      target: "pino-loki",
      level,
      options: {
        host: env.LOKI_URL,
        labels: { app: APP_NAME, env: env.NODE_ENV },
        batching: { interval: 2 },
      },
    });
  }

  return pino(
    {
      level,
      base: { app: APP_NAME, env: env.NODE_ENV },
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    },
    pino.transport({ targets }),
  );
}

// Reused across hot reloads so dev mode doesn't spawn a new transport worker per edit.
const globalForLogger = globalThis as unknown as { logger?: Logger };

export function getLogger(): Logger {
  globalForLogger.logger ??= createLogger();
  return globalForLogger.logger;
}
