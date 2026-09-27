import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  reporter: "list",
  workers: 1,
  outputDir: "./results",
  use: { baseURL: "http://localhost:3000", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
});
