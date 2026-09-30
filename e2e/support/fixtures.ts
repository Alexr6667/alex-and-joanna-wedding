import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { resetDatabase } from "./db";

export const ADMIN_SESSION_COOKIE = "__Secure-neon-auth.session_token";

// Auth runs against e2e/support/mock-neon-auth.mjs. It accepts a few fixed
// session tokens, so tests can be "signed in" without sending real email.
export type MockSession = "approved-admin" | "second-admin" | "unapproved-user" | "unverified-admin";

export async function signInAs(context: BrowserContext, token: MockSession) {
  await context.addCookies([
    {
      name: ADMIN_SESSION_COOKIE,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

/** Opens an invitation link the way a guest would, and checks the token leaves the address bar. */
export async function openInvitation(page: Page, token: string) {
  await page.goto(`/invite/${token}`);
  await expect(page).toHaveURL(/\/$/);
}

export async function guestCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name.includes("wedding_guest"));
}

/** Every test starts from an empty database with the seeded defaults. */
export const test = base.extend<{ cleanDatabase: void }>({
  cleanDatabase: [
    async ({}, use) => {
      await resetDatabase();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
