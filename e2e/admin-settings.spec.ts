import { createGuest, sql } from "./support/db";
import { expect, openInvitation, signInAs, test } from "./support/fixtures";

test.beforeEach(async ({ context }) => {
  await signInAs(context, "approved-admin");
});

test.describe("settings", () => {
  test("switches the site between private and public", async ({ page, browser }) => {
    await page.goto("/admin/settings");
    await expect(page.getByLabel("Private")).toBeChecked();
    await page.getByLabel("Public").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto("/");
    await expect(visitor.getByRole("heading", { name: "The Day" })).toBeVisible();

    await page.getByLabel("Private").check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect.poll(async () => (await sql<{ access_mode: string }>("select access_mode from site_settings"))[0].access_mode).toBe("private");
    await visitor.reload();
    await expect(visitor.getByText("This website is for invited guests")).toBeVisible();
    await visitorContext.close();
  });

  test("sets the RSVP deadline and validates the WhatsApp template", async ({ page }) => {
    await page.goto("/admin/settings");
    await page.getByLabel("RSVP deadline").fill("2027-06-01");
    await page.getByLabel("Message template").fill("Hi {first_name}, no link here");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("must include {link}")).toBeVisible();

    await page.getByLabel("Message template").fill("Hello {first_name}! {link}");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

    const [row] = await sql<{ rsvp_deadline: string; whatsapp_template: string }>(
      "select to_char(rsvp_deadline, 'YYYY-MM-DD') as rsvp_deadline, whatsapp_template from site_settings",
    );
    expect(row).toEqual({ rsvp_deadline: "2027-06-01", whatsapp_template: "Hello {first_name}! {link}" });

    await page.goto("/admin");
    await expect(page.getByTestId("deadline")).toHaveText("1 June 2027");
  });

  test("turns off optional RSVP questions", async ({ page, browser }) => {
    await page.goto("/admin/settings");
    await page.getByLabel("Ask for a song request").uncheck();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

    const guest = await createGuest();
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await openInvitation(guestPage, guest.token);
    await guestPage.getByLabel("Happily accepts").check();
    await expect(guestPage.getByLabel("Dietary requirements")).toBeVisible();
    await expect(guestPage.getByLabel("Song request")).toHaveCount(0);
    await guestContext.close();
  });
});

test.describe("content", () => {
  test("edits page content and timings, which show on the site straight away", async ({ page }) => {
    await page.goto("/admin/content");
    await page.getByLabel("Welcome text").fill("A brand new welcome message.");
    await page.getByLabel("Dress code").fill("Summer formal");
    await page.getByLabel("Time 6").fill("11:30 PM");
    await page.getByLabel("What happens 6").fill("Carriages");
    await page.getByRole("button", { name: "Save content" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Content saved." })).toBeVisible();

    await page.goto("/admin/preview");
    await expect(page.getByText("A brand new welcome message.")).toBeVisible();
    await expect(page.getByText("Summer formal")).toBeVisible();
    await expect(page.getByText("Carriages")).toBeVisible();
  });

  test("rejects a timing row with no description", async ({ page }) => {
    await page.goto("/admin/content");
    await page.getByLabel("Time 7").fill("10:00 PM");
    await page.getByRole("button", { name: "Save content" }).click();
    await expect(page.getByText("Each timing needs both a time and a description.")).toBeVisible();
  });

  test("adds, edits, reorders and deletes FAQ entries", async ({ page }) => {
    await page.goto("/admin/content");
    const add = page.getByRole("form", { name: "Add question" });
    for (const [question, answer] of [
      ["Is there parking?", "Limited street parking."],
      ["Can I bring children?", "Please see your invitation."],
    ]) {
      await add.getByLabel("Question").fill(question);
      await add.getByLabel("Answer").fill(answer);
      await add.getByRole("button", { name: "Add question" }).click();
      await expect(page.getByTestId("faq-entry").filter({ has: page.locator(`input[value="${question}"]`) })).toHaveCount(1);
    }

    await page.getByRole("form", { name: "Move question 2 up" }).getByRole("button").click();
    await expect(page.getByTestId("faq-entry").first().getByLabel(/^Question/)).toHaveValue("Can I bring children?");

    await page.goto("/admin/preview#faq");
    const faqSection = page.locator("#faq");
    await expect(faqSection.locator("summary").first()).toContainText("Can I bring children?");

    await page.goto("/admin/content");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("form", { name: "Delete question 1" }).getByRole("button").click();
    await expect(page.getByTestId("faq-entry")).toHaveCount(1);
  });
});

test.describe("menu", () => {
  test("adds, edits, disables and reorders options", async ({ page }) => {
    await page.goto("/admin/menu");
    await expect(page.getByRole("heading", { name: "Menu choices are off" })).toBeVisible();
    const drinks = page.getByTestId("menu-category-arrival_drink");

    for (const name of ["Cocktail 1", "Beer", "Red wine"]) {
      const add = drinks.getByRole("form", { name: "Add Arrival drink option" });
      await add.getByLabel("New arrival drink option").fill(name);
      await add.getByRole("button", { name: "Add option" }).click();
      await expect(drinks.getByTestId("menu-option").filter({ has: page.locator(`input[value="${name}"]`) })).toHaveCount(1);
    }

    // Forms are labelled by the option name, so find this one by position once renamed.
    const beer = drinks.getByTestId("menu-option").nth(1);
    await beer.getByLabel(/^Name/).fill("Pale ale");
    await beer.getByLabel("Description").fill("Local brewery");
    await beer.getByRole("button", { name: "Save option" }).click();
    await expect(beer.getByRole("status")).toHaveText("Option saved.");

    const wine = drinks.getByRole("form", { name: "Edit Red wine" });
    await wine.getByLabel("Available").uncheck();
    await wine.getByRole("button", { name: "Save option" }).click();
    await expect(drinks.getByText("Not shown to guests")).toBeVisible();

    await drinks.getByRole("form", { name: "Move Pale ale up" }).getByRole("button").click();
    await expect(drinks.getByTestId("menu-option").first().getByLabel(/^Name/)).toHaveValue("Pale ale");

    await page.getByRole("button", { name: "Turn menu choices on" }).click();
    await expect(page.getByRole("heading", { name: "Menu choices are on" })).toBeVisible();

    const options = await sql<{ name: string; active: boolean; display_order: number }>(
      "select name, active, display_order from menu_options where category = 'arrival_drink' order by display_order",
    );
    expect(options.map((o) => [o.name, o.active])).toEqual([
      ["Pale ale", true],
      ["Cocktail 1", true],
      ["Red wine", false],
    ]);
  });

  test("a disabled category is not asked", async ({ page, browser }) => {
    await sql("update site_settings set menu_enabled = true");
    await sql("insert into menu_options (category, name) values ('starter', 'Soup'), ('main', 'Beef')");
    await page.goto("/admin/menu");
    const starter = page.getByRole("form", { name: "Starter settings" });
    await starter.getByLabel("Ask guests").uncheck();
    await starter.getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("heading", { name: "Starter (not asked)" })).toBeVisible();

    const guest = await createGuest();
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await openInvitation(guestPage, guest.token);
    await guestPage.getByLabel("Happily accepts").check();
    await expect(guestPage.getByRole("group", { name: "Main" })).toBeVisible();
    await expect(guestPage.getByRole("group", { name: "Starter" })).toHaveCount(0);
    await guestContext.close();
  });
});
