import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Resume uploads are capped at 5 MB; leave headroom for the rest of the form.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // pino-loki runs in a pino worker thread and must be resolved from node_modules, not bundled.
  // pino, pino-pretty, thread-stream, pg and @prisma/client are already external by default.
  // Transformers.js loads native onnxruntime-node binaries and model files at runtime.
  serverExternalPackages: ["pino-loki", "@huggingface/transformers"],
  // Old role routes before the MSME/student rename (ADR-025); keeps bookmarks and email links working.
  async redirects() {
    return [
      { source: "/student/:path*", destination: "/user/:path*", permanent: true },
      { source: "/msme/:path*", destination: "/organisation/:path*", permanent: true },
      { source: "/admin/msmes", destination: "/admin/organisations", permanent: true },
    ];
  },
};

export default nextConfig;
