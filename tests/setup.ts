import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// Keep test output clean and avoid shipping test logs to Loki.
process.env.LOG_LEVEL = "silent";
process.env.LOKI_URL = "";
// Never call a real (possibly paid) LLM from tests; LLM tests opt in with a stubbed fetch.
process.env.LLM_PROVIDER = "disabled";
