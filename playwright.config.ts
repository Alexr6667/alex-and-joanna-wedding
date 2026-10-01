import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, MOCK_AUTH_PORT, MOCK_AUTH_URL, testEnv } from "./e2e/support/test-env";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // Vitest owns *.test.ts (including e2e/support/*.test.ts); Playwright runs only specs.
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node e2e/support/mock-neon-auth.mjs",
      url: `${MOCK_AUTH_URL}/__test/health`,
      env: { MOCK_NEON_AUTH_PORT: String(MOCK_AUTH_PORT) },
      reuseExistingServer: !isCI,
    },
    {
      // CI builds in an earlier step. Locally, build first so tests run against
      // the production server (no dev overlays or stack traces).
      command: isCI
        ? `npm run start -- --port ${APP_PORT}`
        : `npm run build && npm run start -- --port ${APP_PORT}`,
      // A page that doesn't touch the database: globalSetup prepares the
      // database only after the web servers are up.
      url: `http://localhost:${APP_PORT}/invitation-not-found`,
      env: testEnv,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
