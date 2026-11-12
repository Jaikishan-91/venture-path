import { defineConfig, devices } from "@playwright/test";

// E2E_PORT runs the app on another port (e.g. when 3000 is taken); emailed links follow it.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.E2E_PORT ? `npx next dev --port ${PORT}` : "npm run dev",
    url: baseURL,
    env: process.env.E2E_PORT ? { BETTER_AUTH_URL: baseURL } : undefined,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
