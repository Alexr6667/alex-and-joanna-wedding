import type { Page } from "@playwright/test";
import { addMenuOption, createGuest, saveRsvp, sql, updateSettings } from "./support/db";
import { expect, openInvitation, signInAs, test } from "./support/fixtures";

const LONG_FIRST = "Bartholomew-Maximilian-Alexander";
const LONG_LAST = "Featherstonehaugh-Cholmondeley-Worthington";
const LONG_ANSWER = "This answer is intentionally long. ".repeat(40) + "Supercalifragilisticexpialidocious".repeat(3);

// Sub-pixel layout can round scrollWidth up by a pixel without any real overflow.
const ROUNDING_TOLERANCE_PX = 1;

/**
 * Fails if the page scrolls sideways. Compares the document's scroll width
 * with the configured viewport width and the root's client width, after fonts
 * load and layout settles. Don't use window.innerWidth here: in mobile
 * emulation it grows to fit overflowing content, which hides the overflow.
 */
async function expectNoHorizontalScroll(page: Page) {
  const viewportWidth = page.viewportSize()!.width;
  const { scrollWidth, clientWidth } = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.documentElement;
    return { scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth), clientWidth: root.clientWidth };
  });
  expect(scrollWidth, `${page.url()} at ${viewportWidth}px`).toBeLessThanOrEqual(
    Math.min(viewportWidth, clientWidth) + ROUNDING_TOLERANCE_PX,
  );
}

test.describe("layout with long content", () => {
  test.beforeEach(async () => {
    await updateSettings({ menuEnabled: true });
    await addMenuOption("main", "Slow-roasted heritage beetroot with whipped goat's curd and hazelnut crumb");
    await sql("insert into faq_entries (question, answer) values ($1, $2)", [
      "What happens if my question is extremely long and keeps going well past the width of a phone screen?",
      LONG_ANSWER,
    ]);
  });

  test("the guest site and RSVP form fit the screen", async ({ page }) => {
    const guest = await createGuest({ firstName: LONG_FIRST, lastName: LONG_LAST, plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Anastasia Wilhelmina Konstantinopoulou-Richardson");
    await openInvitation(page, guest.token);
    await page.locator("#faq summary").first().click();
    await expect(page.getByTestId("plus-one-fields")).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Section navigation works by anchor.
    await page.getByRole("navigation", { name: "Wedding sections" }).getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL(/#faq$/);
  });

  test("admin pages and previews fit the screen", async ({ page, context }) => {
    const guest = await createGuest({ firstName: LONG_FIRST, lastName: LONG_LAST });
    await signInAs(context, "approved-admin");
    for (const path of ["/admin", "/admin/guests", `/admin/guests/${guest.id}`, "/admin/preview", `/admin/guests/${guest.id}/preview`, "/admin/settings", "/admin/menu"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await expect(page.getByRole("link", { name: "Exit preview" })).toBeVisible();
  });

  test("maximum-length names with no break points fit the screen", async ({ page, context }) => {
    // 100 characters is the longest name the guest form accepts.
    const guest = await createGuest({ firstName: "A".repeat(100), lastName: "B".repeat(100), plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "C".repeat(100));
    await signInAs(context, "approved-admin");
    for (const path of ["/admin", "/admin/guests", `/admin/guests/${guest.id}`, `/admin/guests/${guest.id}/preview`]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await context.clearCookies();
    await openInvitation(page, guest.token);
    await expectNoHorizontalScroll(page);
  });

  test("the guest preview banner fits common phone widths with maximum-length names", async ({ page, context }) => {
    // 100 characters is the longest first or last name the admin form accepts.
    const guest = await createGuest({ firstName: "A".repeat(100), lastName: "B".repeat(100) });
    await signInAs(context, "approved-admin");
    for (const width of [320, 375, 393, 428]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/admin/guests/${guest.id}/preview`);
      const banner = page.getByRole("region", { name: "Preview mode" });
      await expect(banner.getByTestId("preview-title")).toHaveText(`Viewing as ${"A".repeat(100)} ${"B".repeat(100)}.`);
      await expect(banner.getByRole("link", { name: "Exit preview" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      const box = await banner.boundingBox();
      expect(box!.width, `banner at ${width}px`).toBeLessThanOrEqual(width + ROUNDING_TOLERANCE_PX);
    }
  });

  test("earlier menu choices with long names fit common phone widths", async ({ page }) => {
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    const starter = await addMenuOption("starter", "S".repeat(120));
    const main = await addMenuOption("main", "M".repeat(120), 2, false);
    await sql("update rsvp_attendees set starter_option_id = $1, main_option_id = $2 where guest_id = $3", [
      starter,
      main,
      guest.id,
    ]);
    await sql("update menu_categories set enabled = false where key = 'starter'");
    await openInvitation(page, guest.token);

    for (const width of [320, 375, 393, 428]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByTestId("earlier-choices")).toContainText("S".repeat(120));
      await expect(page.getByTestId("earlier-choice")).toContainText("M".repeat(120));
      await expectNoHorizontalScroll(page);
    }
  });

  test("the invitation-only page fits the screen", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page);
  });
});
