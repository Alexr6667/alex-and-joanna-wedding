import { assertDisposableDatabase } from "./database-guard";

export const APP_PORT = 3100;
export const MOCK_AUTH_PORT = 4010;
export const MOCK_AUTH_URL = `http://127.0.0.1:${MOCK_AUTH_PORT}`;

export const APPROVED_ADMIN_EMAIL = "alex@example.com";

// Throwaway Postgres for the suite: a Docker container locally, a service
// container in CI. Never a Neon branch. The suite wipes it before every test,
// so an override is checked before anything connects to it.
export const TEST_DB_PORT = Number(process.env.E2E_DB_PORT ?? 54329);
export const TEST_DATABASE_URL = assertDisposableDatabase(
  process.env.E2E_DATABASE_URL ?? `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/wedding_e2e`,
);

// Fixed, non-secret values for the test run. They override anything in
// .env.local, so the suite never talks to a real Neon project.
export const testEnv = {
  DATABASE_URL: TEST_DATABASE_URL,
  NEON_AUTH_BASE_URL: `${MOCK_AUTH_URL}/neondb/auth`,
  NEON_AUTH_COOKIE_SECRET: "playwright-only-cookie-secret-0123456789",
  ADMIN_EMAILS: `${APPROVED_ADMIN_EMAIL},joanna@example.com`,
};
