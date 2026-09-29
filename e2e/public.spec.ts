import { expect, test } from "@playwright/test";

test.describe("homepage", () => {
  test("loads and shows the couple and the date", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle("Alex & Joanna");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alex & Joanna");
    await expect(page.getByText("28 August 2027")).toBeVisible();
    await expect(page.getByText("Wedding website coming soon")).toBeVisible();
  });

  test("sends baseline security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("RSVP placeholder", () => {
  test("renders safely for a token and does not echo it", async ({ page }) => {
    const response = await page.goto("/rsvp/test-token");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");

    await expect(page.getByRole("heading", { name: "RSVP" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("test-token");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("returns 404 for a malformed token without rendering it", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });

    const response = await page.goto("/rsvp/%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(dialogOpened).toBe(false);
  });
});
