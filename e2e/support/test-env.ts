export const APP_PORT = 3100;
export const MOCK_AUTH_PORT = 4010;
export const MOCK_AUTH_URL = `http://127.0.0.1:${MOCK_AUTH_PORT}`;

export const APPROVED_ADMIN_EMAIL = "alex@example.com";

// Fixed, non-secret values for the test run. They override anything in
// .env.local, so the suite never talks to a real Neon project.
export const testEnv = {
  DATABASE_URL: "postgresql://test:test@db.invalid/neondb?sslmode=require",
  NEON_AUTH_BASE_URL: `${MOCK_AUTH_URL}/neondb/auth`,
  NEON_AUTH_COOKIE_SECRET: "playwright-only-cookie-secret-0123456789",
  ADMIN_EMAILS: `${APPROVED_ADMIN_EMAIL},joanna@example.com`,
};
