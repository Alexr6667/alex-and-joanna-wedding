import { expect, test, type BrowserContext } from "@playwright/test";
import { APPROVED_ADMIN_EMAIL, MOCK_AUTH_URL } from "./support/test-env";

// Auth runs against e2e/support/mock-neon-auth.mjs. It accepts a few fixed
// session tokens, so tests can be "signed in" without sending real email.
type MockSession = "approved-admin" | "unapproved-user" | "unverified-admin";

async function signInAs(context: BrowserContext, token: MockSession) {
  await context.addCookies([
    {
      name: "__Secure-neon-auth.session_token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

type MagicLinkRequest = { email: string; callbackURL: string; errorCallbackURL: string };

async function magicLinkRequestsSentToNeon(): Promise<MagicLinkRequest[]> {
  const response = await fetch(`${MOCK_AUTH_URL}/__test/magic-link-requests`);
  return response.json();
}

test.beforeEach(async () => {
  await fetch(`${MOCK_AUTH_URL}/__test/magic-link-requests`, { method: "DELETE" });
});

test.describe("anonymous visitor", () => {
  test("is redirected from /admin to the login page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    await expect(page.getByText("Signed in as")).toHaveCount(0);
  });

  test("never receives admin content from a direct /admin request", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers()["location"]).toMatch(/\/admin\/login$/);
  });
});

test.describe("login page", () => {
  test("renders an email-only form with no password field", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  });

  test("shows a message when a sign-in link was invalid or expired", async ({ page }) => {
    await page.goto("/admin/login?error=link");
    await expect(page.getByText("That sign-in link is invalid or has expired")).toBeVisible();
  });

  test("requests a magic link for an approved email", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email address").fill("Alex@Example.com");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    await expect(page.getByRole("status")).toContainText("If that address is approved");
    expect(await magicLinkRequestsSentToNeon()).toEqual([
      { email: APPROVED_ADMIN_EMAIL, callbackURL: "/admin", errorCallbackURL: "/admin/login?error=link" },
    ]);
  });

  test("shows the same response for an unapproved email but sends nothing", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email address").fill("guest@example.com");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    await expect(page.getByRole("status")).toContainText("If that address is approved");
    expect(await magicLinkRequestsSentToNeon()).toEqual([]);
  });
});

test.describe("following a magic link", () => {
  // After verifying the emailed link, Neon Auth redirects to the callback URL
  // with a one-time verifier. This is the address the browser lands on.
  test("signs an approved admin in and lands on /admin", async ({ page }) => {
    await page.goto("/admin?neon_auth_session_verifier=ml-approved-admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(`Signed in as ${APPROVED_ADMIN_EMAIL}`)).toBeVisible();

    // The session survives a reload.
    await page.reload();
    await expect(page.getByText(`Signed in as ${APPROVED_ADMIN_EMAIL}`)).toBeVisible();
  });

  test("an unknown or used verifier shows the invalid-link message", async ({ page }) => {
    await page.goto("/admin?neon_auth_session_verifier=ml-not-a-real-verifier");
    await expect(page).toHaveURL(/\/admin\/login\?error=link$/);
    await expect(page.getByText("That sign-in link is invalid or has expired")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
  });
});

test.describe("auth API proxy", () => {
  test("overrides caller-supplied redirect targets", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/magic-link", {
      data: { email: APPROVED_ADMIN_EMAIL, callbackURL: "https://attacker.example/" },
    });
    expect(response.ok()).toBe(true);
    const [sent] = await magicLinkRequestsSentToNeon();
    expect(sent.callbackURL).toBe("/admin");
  });

  test("refuses password sign-up and sign-in", async ({ request }) => {
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { email: APPROVED_ADMIN_EMAIL, password: "password123", name: "x" },
    });
    expect(signUp.status()).toBe(404);

    const signIn = await request.post("/api/auth/sign-in/email", {
      data: { email: APPROVED_ADMIN_EMAIL, password: "password123" },
    });
    expect(signIn.status()).toBe(404);
  });
});

test.describe("signed-in users", () => {
  test("an account that is not on the allowlist is denied", async ({ page, context }) => {
    await signInAs(context, "unapproved-user");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText("Signed in as")).toHaveCount(0);
  });

  test("an allowlisted email that is not verified is denied", async ({ page, context }) => {
    await signInAs(context, "unverified-admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });

  test("an approved admin can open /admin and sign out", async ({ page, context }) => {
    await signInAs(context, "approved-admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${APPROVED_ADMIN_EMAIL}`)).toBeVisible();
    // CI has no database, so the status check reports it as unavailable.
    await expect(page.getByTestId("database-status")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("an approved admin visiting the login page is sent to /admin", async ({ page, context }) => {
    await signInAs(context, "approved-admin");
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);
  });
});
