import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Resume uploads are capped at 5 MB; leave headroom for the rest of the form.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // pino-loki runs in a pino worker thread and must be resolved from node_modules, not bundled.
  // pino, pino-pretty, thread-stream, pg and @prisma/client are already external by default.
  // Transformers.js loads native onnxruntime-node binaries and model files at runtime.
  serverExternalPackages: ["pino-loki", "@huggingface/transformers"],
};

export default nextConfig;
