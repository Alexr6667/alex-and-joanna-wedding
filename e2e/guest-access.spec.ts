import type { APIResponse } from "@playwright/test";
import { createGuest, newToken, countGuestSessions, openTransaction, updateSettings } from "./support/db";
import { expect, guestCookie, openInvitation, test } from "./support/fixtures";

test.describe("private site (default)", () => {
  test("blocks an anonymous visitor without revealing wedding details", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private wedding website");
    await expect(page.getByText("This website is for invited guests")).toBeVisible();

    const body = page.locator("body");
    await expect(body).not.toContainText("28 August");
    await expect(body).not.toContainText("St Johns Church");
    await expect(body).not.toContainText("The Larrik");
    await expect(page.getByRole("form")).toHaveCount(0);
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute("content", /August/);
  });

  test("a valid invitation unlocks the site and the token leaves the URL", async ({ page, context }) => {
    const guest = await createGuest({ firstName: "James" });
    await openInvitation(page, guest.token);

    expect(page.url()).not.toContain(guest.token);
    expect(page.url()).not.toContain("invite");
    await expect(page.getByRole("heading", { name: "The Day" })).toBeVisible();
    await expect(page.getByText("St Johns Church").first()).toBeVisible();
    await expect(page.getByText("Dear James,")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(guest.token);

    const cookie = await guestCookie(context);
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.secure).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    // The cookie is a fresh session value, not the invitation token or a guest id.
    expect(cookie!.value).not.toBe(guest.token);
    expect(cookie!.value).not.toContain(guest.id);
  });

  test("the guest session persists across a refresh and a new visit", async ({ page }) => {
    const guest = await createGuest({ firstName: "Sarah" });
    await openInvitation(page, guest.token);
    await page.reload();
    await expect(page.getByText("Dear Sarah,")).toBeVisible();
    await page.goto("/#faq");
    await expect(page.getByText("Dear Sarah,")).toBeVisible();
  });

  test("an unknown invitation token does not unlock the site", async ({ page }) => {
    await page.goto(`/invite/${newToken().token}`);
    await expect(page).toHaveURL(/\/invitation-not-found$/);
    await expect(page.getByRole("heading", { name: "Link not recognised" })).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("This website is for invited guests")).toBeVisible();
    expect(await countGuestSessions()).toBe(0);
  });

  test("a malformed token is rejected without being rendered", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });
    await page.goto("/invite/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    await expect(page).toHaveURL(/\/invitation-not-found$/);
    await expect(page.locator("body")).not.toContainText("script");
    expect(dialogOpened).toBe(false);
  });

  test("an archived guest's invitation no longer works", async ({ page }) => {
    const guest = await createGuest({ archived: true });
    await page.goto(`/invite/${guest.token}`);
    await expect(page).toHaveURL(/\/invitation-not-found$/);
  });

  test("a forged or altered session cookie is ignored", async ({ request, page, context }) => {
    const guest = await createGuest({ firstName: "Emily" });
    await openInvitation(page, guest.token);
    const real = (await guestCookie(context))!;

    const asCookie = (value: string) => ({ headers: { cookie: `${real.name}=${value}` } });
    const genuine = await (await request.get("/", asCookie(real.value))).text();
    expect(genuine).toContain("Emily");

    // Change the last character to one that is guaranteed to differ.
    const altered = `${real.value.slice(0, -1)}${real.value.endsWith("A") ? "B" : "A"}`;
    for (const value of [newToken().token, altered, guest.id, guest.token]) {
      const html = await (await request.get("/", asCookie(value))).text();
      expect(html).toContain("This website is for invited guests");
      expect(html).not.toContain("Emily");
    }
  });

  test("a link opened while it is being regenerated leaves no session behind", async ({ request }) => {
    const guest = await createGuest();

    // Regenerate the link in a transaction that stays open: the new hash is
    // written and old sessions deleted, but not yet committed.
    // The exchange must wait for it: exactly one request blocked behind the regeneration's lock.
    const regeneration = await openTransaction();
    let response: APIResponse;
    try {
      await regeneration.query("update guests set invitation_token_hash = $1 where id = $2", [newToken().hash, guest.id]);
      await regeneration.query("delete from guest_sessions where guest_id = $1", [guest.id]);
      const exchange = request.get(`/invite/${guest.token}`, { maxRedirects: 0 });
      await regeneration.waitForBlocked(1);
      await regeneration.commit();
      response = await exchange;
    } finally {
      await regeneration.close();
    }

    expect(new URL(response.headers()["location"]).pathname).toBe("/invitation-not-found");
    expect(await countGuestSessions()).toBe(0);
  });

  test("the invitation exchange sends no-referrer and does not cache", async ({ request }) => {
    const guest = await createGuest();
    const response = await request.get(`/invite/${guest.token}`, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(new URL(response.headers()["location"]).pathname).toBe("/");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["set-cookie"]).toMatch(/__Host-wedding_guest=.*HttpOnly/i);
  });
});

test.describe("public site", () => {
  test.beforeEach(async () => {
    await updateSettings({ accessMode: "public" });
  });

  test("shows general wedding information to anyone", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "The Day" })).toBeVisible();
    await expect(page.getByText("28 August 2027").first()).toBeVisible();
    await expect(page.getByText("St Johns Church").first()).toBeVisible();
  });

  test("still requires an invitation to RSVP", async ({ page }) => {
    await page.goto("/#rsvp");
    await expect(page.getByText("To reply, please open the personal link from your invitation.")).toBeVisible();
    await expect(page.getByRole("form", { name: "RSVP form" })).toHaveCount(0);
    await expect(page.getByLabel("Happily accepts")).toHaveCount(0);
  });

  test("an invited guest gets their own RSVP form", async ({ page }) => {
    const guest = await createGuest({ firstName: "David" });
    await openInvitation(page, guest.token);
    await expect(page.getByText("Dear David,")).toBeVisible();
    await expect(page.getByRole("form", { name: "RSVP form" })).toBeVisible();
  });
});

test.describe("baseline", () => {
  test("sends security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("is not indexed by search engines", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
