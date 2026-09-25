import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Keep test output clean and avoid shipping test logs to Loki.
process.env.LOG_LEVEL = "silent";
process.env.LOKI_URL = "";
