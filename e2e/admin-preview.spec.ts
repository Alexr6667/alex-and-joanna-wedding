import { addMenuOption, countGuestSessions, createGuest, getRsvp, saveRsvp, sql, updateSettings } from "./support/db";
import { expect, guestCookie, signInAs, test } from "./support/fixtures";

test.describe("general admin preview", () => {
  test("opens the wedding site in a new tab while the site is private", async ({ page, context }) => {
    await signInAs(context, "approved-admin");
    await page.goto("/admin");

    const [preview] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("link", { name: /Preview wedding site/ }).click(),
    ]);
    await preview.waitForLoadState();
    await expect(preview).toHaveURL(/\/admin\/preview$/);
    await expect(preview.getByRole("region", { name: "Preview mode" })).toContainText("The site is private");
    await expect(preview.getByRole("heading", { name: "Alex & Joanna", level: 1 })).toBeVisible();
    await expect(preview.getByRole("heading", { name: "The Day" })).toBeVisible();
    await expect(preview.getByText("St Johns Church").first()).toBeVisible();

    // The real site is still private for everyone else.
    const anonymous = await context.browser()!.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto("/");
    await expect(visitor.getByText("This website is for invited guests")).toBeVisible();
    await anonymous.close();
  });

  test("does not expose any guest data", async ({ page, context }) => {
    await updateSettings({ menuEnabled: true });
    await addMenuOption("main", "Beef");
    const guest = await createGuest({ firstName: "Zebedee", lastName: "Quartermain", plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Ottoline Plusone");
    await sql("update rsvps set notes = 'secret-note-123' where guest_id = $1", [guest.id]);

    await signInAs(context, "approved-admin");
    await page.goto("/admin/preview");
    await expect(page.getByTestId("rsvp-preview-placeholder")).toBeVisible();
    await expect(page.getByRole("form", { name: "RSVP form" })).toHaveCount(0);

    const html = await page.content();
    for (const secret of ["Zebedee", "Quartermain", "Ottoline", "secret-note-123", guest.id, guest.token]) {
      expect(html).not.toContain(secret);
    }
  });

  test("does not create a guest session", async ({ page, context }) => {
    await createGuest();
    await signInAs(context, "approved-admin");
    await page.goto("/admin/preview");
    await expect(page.getByRole("heading", { name: "The Day" })).toBeVisible();
    expect(await guestCookie(context)).toBeUndefined();
    expect(await countGuestSessions()).toBe(0);

    await page.goto("/");
    await expect(page.getByText("This website is for invited guests")).toBeVisible();
  });

  test("the exit link returns to the dashboard", async ({ page, context }) => {
    await signInAs(context, "approved-admin");
    await page.goto("/admin/preview");
    await page.getByRole("link", { name: "Exit preview" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe("preview as guest", () => {
  test("reflects the guest's name, RSVP state and plus-one permission", async ({ page, context }) => {
    const guest = await createGuest({ firstName: "James", lastName: "Smith", plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Priya Patel");
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}`);
    await page.getByRole("link", { name: "Preview as guest" }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/guests/${guest.id}/preview$`));
    await expect(page.getByTestId("preview-title")).toHaveText("Viewing as James Smith.");
    await expect(page.getByText("Dear James,")).toBeVisible();

    const form = page.getByRole("form", { name: "RSVP form" });
    await expect(form.getByLabel("Happily accepts")).toBeChecked();
    await expect(form.getByText("Will you be bringing a guest?")).toBeVisible();
    await expect(page.getByTestId("plus-one-fields").getByLabel("Your guest's full name")).toHaveValue("Priya Patel");
    await expect(form.getByLabel("Happily accepts")).toBeDisabled();
    await expect(page.getByTestId("preview-form-note")).toBeVisible();
    await expect(form.getByRole("button", { name: /reply/ })).toHaveCount(0);
  });

  test("hides plus-one controls for a guest without a plus-one", async ({ page, context }) => {
    const guest = await createGuest({ plusOneAllowed: false });
    await saveRsvp(guest.id, true);
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await expect(page.getByLabel("Happily accepts")).toBeChecked();
    await expect(page.getByText("Will you be bringing a guest?")).toHaveCount(0);
  });

  test("shows the guest's menu choices and the closed state after the deadline", async ({ page, context }) => {
    await updateSettings({ menuEnabled: true, rsvpDeadline: "2020-01-31" });
    const beef = await addMenuOption("main", "Beef Wellington");
    const guest = await createGuest({ firstName: "Sarah" });
    await saveRsvp(guest.id, true);
    await sql("update rsvp_attendees set main_option_id = $1 where guest_id = $2", [beef, guest.id]);

    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await expect(page.getByText("RSVPs closed on 31 January 2020.")).toBeVisible();
    await expect(page.getByTestId("rsvp-summary")).toContainText("Beef Wellington");
  });

  test("never exposes the raw invitation token or its hash", async ({ page, context }) => {
    const guest = await createGuest();
    const [{ invitation_token_hash: hash }] = await sql<{ invitation_token_hash: string }>(
      "select invitation_token_hash from guests where id = $1",
      [guest.id],
    );
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    const html = await page.content();
    expect(html).not.toContain(guest.token);
    expect(html).not.toContain(hash);

    await page.goto(`/admin/guests/${guest.id}`);
    const adminHtml = await page.content();
    expect(adminHtml).not.toContain(guest.token);
    expect(adminHtml).not.toContain(hash);
  });

  test("cannot be used without admin authentication", async ({ page, context, request }) => {
    const guest = await createGuest({ firstName: "Hidden" });

    const anonymous = await request.get(`/admin/guests/${guest.id}/preview`, { maxRedirects: 0 });
    expect(anonymous.status()).toBeGreaterThanOrEqual(300);
    expect(anonymous.status()).toBeLessThan(400);
    expect(anonymous.headers()["location"]).toMatch(/\/admin\/login$/);

    await signInAs(context, "unapproved-user");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Hidden");

    await page.goto("/admin/preview");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });

  test("exiting returns to the guest's admin page", async ({ page, context }) => {
    const guest = await createGuest({ firstName: "Emma", lastName: "Brown" });
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await page.getByRole("link", { name: "Exit preview" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/guests/${guest.id}$`));
    await expect(page.getByRole("heading", { name: "Emma Brown" })).toBeVisible();
  });

  test("does not leave a guest session behind or change the guest's RSVP", async ({ page, context }) => {
    const guest = await createGuest();
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}/preview`);
    await expect(page.getByText("Dear James,")).toBeVisible();

    expect(await guestCookie(context)).toBeUndefined();
    expect(await countGuestSessions()).toBe(0);
    expect((await getRsvp(guest.id)).rsvp).toBeUndefined();

    // After previewing, the admin's browser is not a guest on the real site.
    await page.goto("/");
    await expect(page.getByText("This website is for invited guests")).toBeVisible();
    // And the admin session itself is untouched.
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
