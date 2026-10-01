import type { APIRequestContext } from "@playwright/test";
import { createGuest, newToken, sql, updateSettings } from "./support/db";
import { expect, openInvitation, signInAs, test } from "./support/fixtures";

// Private mode must not say whose wedding this is to anyone without an
// invitation: not in visible text, metadata, the RSC payload inlined in the
// HTML, or the scripts the page loads. Guests, public mode and admins still
// see the names.

const NAMES = /Joanna/i;

// A normal browser gets streamed metadata; link-preview fetchers (WhatsApp)
// get it in <head>. Check both.
const USER_AGENTS = {
  browser: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  linkPreview: "WhatsApp/2.23.20.0",
};

/** Fetches the server-rendered HTML and every script it loads, and checks none of it names the couple. */
async function expectNoNamesServed(request: APIRequestContext, path: string) {
  for (const userAgent of Object.values(USER_AGENTS)) {
    const response = await request.get(path, { headers: { "user-agent": userAgent } });
    const html = await response.text();
    expect(html, `${path} HTML`).not.toMatch(NAMES);

    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(scripts.length, `${path} loads scripts`).toBeGreaterThan(0);
    for (const src of scripts) {
      const script = await (await request.get(src)).text();
      expect(script, `${path} script ${src}`).not.toMatch(NAMES);
    }
  }
}

test.describe("private mode, anonymous visitor", () => {
  test("the home page says it is a private wedding website and nothing more", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Private wedding website");
    await expect(page.getByText("Please use the personal link from your invitation")).toBeVisible();
    await expect(page).toHaveTitle("Wedding");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "A private wedding website.");
    await expect(page.locator("body")).not.toContainText(NAMES);

    await expectNoNamesServed(request, "/");
  });

  test("an invalid invitation gets a generic page that doesn't reveal whether the link existed", async ({
    page,
    request,
  }) => {
    const guest = await createGuest();
    // A real link that has since been replaced by a newer one.
    const replaced = await createGuest({ firstName: "Replaced" });
    await sql("update guests set invitation_token_hash = $1 where id = $2", [newToken().hash, replaced.id]);

    const texts: string[] = [];
    for (const token of ["not-a-token", newToken().token, replaced.token]) {
      await page.context().clearCookies();
      await page.goto(`/invite/${token}`);
      await expect(page).toHaveURL(/\/invitation-not-found$/);
      await expect(page.getByRole("heading", { name: "Link not recognised" })).toBeVisible();
      await expect(page.locator("main").getByRole("alert")).toContainText("isn't valid or is no longer available");
      await expect(page).toHaveTitle("Invitation link not recognised");
      texts.push(await page.locator("main").innerText());
    }
    // Malformed, unknown and replaced links all get exactly the same page.
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).not.toMatch(NAMES);
    expect(texts[0]).not.toContain(guest.firstName);

    await expectNoNamesServed(request, "/invitation-not-found");
  });

  test("the admin login page carries no names", async ({ page, request }) => {
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
    await expect(page).toHaveTitle("Admin sign in");
    await expect(page.locator("body")).not.toContainText(NAMES);

    await expectNoNamesServed(request, "/admin/login");
    // Admin pages redirect before rendering anything.
    for (const path of ["/admin", "/admin/preview", "/admin/guests"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(await response.text(), path).not.toMatch(NAMES);
    }
  });
});

test.describe("visitors who can see the site", () => {
  test("an invited guest sees the couple's names", async ({ page }) => {
    const guest = await createGuest();
    await openInvitation(page, guest.token);
    await expect(page).toHaveTitle("Alex & Joanna");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "The wedding of Alex & Joanna");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alex & Joanna");
  });

  test("public mode shows the couple's names to everyone", async ({ page }) => {
    await updateSettings({ accessMode: "public" });
    await page.goto("/");
    await expect(page).toHaveTitle("Alex & Joanna");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alex & Joanna");
  });

  test("an approved admin still reaches the admin area and the site preview", async ({ page, context }) => {
    await signInAs(context, "approved-admin");
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/preview");
    await expect(page.getByRole("heading", { name: "Alex & Joanna", level: 1 })).toBeVisible();
  });
});
