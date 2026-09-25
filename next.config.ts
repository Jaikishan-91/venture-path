import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino-loki runs in a pino worker thread and must be resolved from node_modules, not bundled.
  // pino, pino-pretty, thread-stream, pg and @prisma/client are already external by default.
  serverExternalPackages: ["pino-loki"],
};

export default nextConfig;
