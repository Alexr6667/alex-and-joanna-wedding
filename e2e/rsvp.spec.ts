import type { Page } from "@playwright/test";
import { addMenuOption, createGuest, getRsvp, openTransaction, saveRsvp, sql, updateSettings } from "./support/db";
import { expect, openInvitation, signInAs, test } from "./support/fixtures";

const rsvpForm = (page: Page) => page.getByRole("form", { name: "RSVP form" });
const saveButton = (page: Page) => rsvpForm(page).getByRole("button", { name: /Send reply|Update reply|Save RSVP/ });

async function setUpMenu() {
  await updateSettings({ menuEnabled: true });
  return {
    cocktail: await addMenuOption("arrival_drink", "Cocktail 1", 1),
    beer: await addMenuOption("arrival_drink", "Beer", 2),
    soup: await addMenuOption("starter", "Soup", 1),
    beef: await addMenuOption("main", "Beef", 1),
    risotto: await addMenuOption("main", "Risotto", 2),
    tart: await addMenuOption("dessert", "Lemon tart", 1),
  };
}

test.describe("guest RSVP", () => {
  test("accepts the invitation", async ({ page }) => {
    const guest = await createGuest();
    await openInvitation(page, guest.token);

    await rsvpForm(page).getByLabel("Happily accepts").check();
    await rsvpForm(page).getByLabel("Song request").fill("September");
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Your reply has been saved" })).toBeVisible();

    const { rsvp } = await getRsvp(guest.id);
    expect(rsvp.attending).toBe(true);
    expect(rsvp.song_request).toBe("September");
    expect(rsvp.updated_by).toBe("guest");
  });

  test("declines the invitation", async ({ page }) => {
    const guest = await createGuest();
    await openInvitation(page, guest.token);

    await rsvpForm(page).getByLabel("Regretfully declines").check();
    await expect(rsvpForm(page).getByLabel("Song request")).toHaveCount(0);
    await rsvpForm(page).getByLabel("Anything else we should know?").fill("Sorry to miss it");
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you for letting us know" })).toBeVisible();

    const { rsvp } = await getRsvp(guest.id);
    expect(rsvp.attending).toBe(false);
    expect(rsvp.notes).toBe("Sorry to miss it");
  });

  test("updates an earlier response after revisiting", async ({ page }) => {
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await openInvitation(page, guest.token);

    await expect(rsvpForm(page).getByLabel("Happily accepts")).toBeChecked();
    await rsvpForm(page).getByLabel("Regretfully declines").check();
    await rsvpForm(page).getByRole("button", { name: "Update reply" }).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    await page.reload();
    await expect(rsvpForm(page).getByLabel("Regretfully declines")).toBeChecked();
    expect((await getRsvp(guest.id)).rsvp.attending).toBe(false);
  });

  test("saves dietary requirements", async ({ page }) => {
    const guest = await createGuest();
    await openInvitation(page, guest.token);
    await rsvpForm(page).getByLabel("Happily accepts").check();
    await rsvpForm(page).getByLabel("Dietary requirements").fill("Vegetarian, no nuts");
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    const { attendees } = await getRsvp(guest.id);
    expect(attendees.find((a) => a.role === "guest")?.dietary_requirements).toBe("Vegetarian, no nuts");
  });
});

test.describe("RSVP deadline", () => {
  test("closes guest editing after the deadline but shows the reply", async ({ page }) => {
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await updateSettings({ rsvpDeadline: "2020-01-31" });
    await openInvitation(page, guest.token);

    await expect(page.getByText("RSVPs closed on 31 January 2020.")).toBeVisible();
    await expect(page.getByTestId("rsvp-summary")).toContainText("Happily accepts");
    await expect(rsvpForm(page)).toHaveCount(0);
  });

  test("the closed summary still shows a choice whose option was later switched off", async ({ page }) => {
    await updateSettings({ menuEnabled: true, rsvpDeadline: "2020-01-31" });
    const historic = await addMenuOption("main", "Historic meal");
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await sql("update rsvp_attendees set main_option_id = $1 where guest_id = $2", [historic, guest.id]);
    // Its only option is retired, so guests are no longer asked about "Main".
    await sql("update menu_options set active = false where id = $1", [historic]);

    await openInvitation(page, guest.token);
    const summary = page.getByTestId("rsvp-summary");
    await expect(summary).toContainText("Main");
    await expect(summary).toContainText("Historic meal");

    // Switching menu choices off altogether keeps it too.
    await updateSettings({ menuEnabled: false });
    await page.reload();
    await expect(summary).toContainText("Historic meal");
  });

  test("stays open until the end of the deadline day", async ({ page }) => {
    const guest = await createGuest();
    await updateSettings({ rsvpDeadline: "2099-12-31" });
    await openInvitation(page, guest.token);
    await expect(page.getByText("Please let us know by 31 December 2099.")).toBeVisible();
    await expect(rsvpForm(page)).toBeVisible();
  });

  test("an admin can still edit a response after the deadline", async ({ page, context }) => {
    const guest = await createGuest({ firstName: "Late", lastName: "Responder" });
    await updateSettings({ rsvpDeadline: "2020-01-31" });
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}`);

    await expect(page.getByText("Guests can't change their reply, but you still can here.")).toBeVisible();
    await rsvpForm(page).getByLabel("Happily accepts").check();
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "RSVP saved." })).toBeVisible();

    const { rsvp } = await getRsvp(guest.id);
    expect(rsvp.attending).toBe(true);
    expect(rsvp.updated_by).toBe("admin");
  });
});

test.describe("plus-ones", () => {
  test("are never offered when not allowed", async ({ page }) => {
    const guest = await createGuest({ plusOneAllowed: false });
    await openInvitation(page, guest.token);
    await rsvpForm(page).getByLabel("Happily accepts").check();
    await expect(page.getByText("Will you be bringing a guest?")).toHaveCount(0);
  });

  test("are offered when allowed, and the yes path saves the guest's details", async ({ page }) => {
    const menu = await setUpMenu();
    const guest = await createGuest({ plusOneAllowed: true });
    await openInvitation(page, guest.token);

    const form = rsvpForm(page);
    await form.getByLabel("Happily accepts").check();
    await expect(form.getByText("Will you be bringing a guest?")).toBeVisible();
    await expect(page.getByTestId("plus-one-fields")).toHaveCount(0);

    const mine = form.getByRole("region", { name: "Your choices" });
    await mine.getByRole("group", { name: "Arrival drink" }).getByLabel("Beer").check();
    await mine.getByRole("group", { name: "Starter" }).getByLabel("Soup").check();
    await mine.getByRole("group", { name: "Main" }).getByLabel("Beef").check();
    await mine.getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();

    await form.getByRole("group", { name: "Will you be bringing a guest?" }).getByLabel("Yes").check();
    const plusOne = page.getByTestId("plus-one-fields");
    await expect(plusOne).toBeVisible();

    // The name is required.
    await saveButton(page).click();
    await expect(rsvpForm(page).getByRole("alert")).toContainText("Please tell us your guest's name.");

    await plusOne.getByLabel("Your guest's full name").fill("Alexandria Montgomery-Fitzwilliam");
    await plusOne.getByRole("group", { name: "Arrival drink" }).getByLabel("Cocktail 1").check();
    await plusOne.getByRole("group", { name: "Starter" }).getByLabel("Soup").check();
    await plusOne.getByRole("group", { name: "Main" }).getByLabel("Risotto").check();
    await plusOne.getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();
    await plusOne.getByLabel("Dietary requirements").fill("Coeliac");
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    const { rsvp, attendees } = await getRsvp(guest.id);
    expect(rsvp.bringing_plus_one).toBe(true);
    const saved = attendees.find((a) => a.role === "plus_one")!;
    expect(saved.full_name).toBe("Alexandria Montgomery-Fitzwilliam");
    expect(saved.main_option_id).toBe(menu.risotto);
    expect(saved.arrival_drink_option_id).toBe(menu.cocktail);
    expect(saved.dietary_requirements).toBe("Coeliac");
    expect(attendees.find((a) => a.role === "guest")!.main_option_id).toBe(menu.beef);
  });

  test("the no path needs no details and removes an earlier plus-one", async ({ page }) => {
    const guest = await createGuest({ plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Old Friend");
    await openInvitation(page, guest.token);

    const form = rsvpForm(page);
    await expect(page.getByTestId("plus-one-fields").getByLabel("Your guest's full name")).toHaveValue("Old Friend");
    await form.getByRole("group", { name: "Will you be bringing a guest?" }).getByLabel("No").check();
    await expect(page.getByTestId("plus-one-fields")).toHaveCount(0);
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    const { rsvp, attendees } = await getRsvp(guest.id);
    expect(rsvp.bringing_plus_one).toBe(false);
    expect(attendees.filter((a) => a.role === "plus_one")).toHaveLength(0);
  });

  test("a reply sent while an admin withdraws the plus-one doesn't bring it back", async ({ page }) => {
    const guest = await createGuest({ plusOneAllowed: true });
    await openInvitation(page, guest.token);

    const form = rsvpForm(page);
    await form.getByLabel("Happily accepts").check();
    await form.getByRole("group", { name: "Will you be bringing a guest?" }).getByLabel("Yes").check();
    await page.getByTestId("plus-one-fields").getByLabel("Your guest's full name").fill("Late Addition");

    // The admin's change is in progress (not committed) when the guest presses save.
    // The save must wait for it: exactly one request blocked behind the admin's lock.
    const adminEdit = await openTransaction();
    try {
      await adminEdit.query("update guests set plus_one_allowed = false where id = $1", [guest.id]);
      await saveButton(page).click();
      await adminEdit.waitForBlocked(1);
      await adminEdit.commit();
    } finally {
      await adminEdit.close();
    }

    await expect(rsvpForm(page).getByRole("alert").first()).toContainText("Your invitation has changed");
    const { rsvp, attendees } = await getRsvp(guest.id);
    expect(rsvp).toBeUndefined();
    expect(attendees.filter((a) => a.role === "plus_one")).toHaveLength(0);
  });
});

test.describe("menu choices", () => {
  test("are hidden when menu choices are switched off", async ({ page }) => {
    await addMenuOption("main", "Beef");
    const guest = await createGuest();
    await openInvitation(page, guest.token);
    await rsvpForm(page).getByLabel("Happily accepts").check();
    await expect(rsvpForm(page).getByRole("group", { name: "Main" })).toHaveCount(0);
    await expect(rsvpForm(page).getByLabel("Beef")).toHaveCount(0);
  });

  test("are shown when switched on, required, and saved", async ({ page }) => {
    const menu = await setUpMenu();
    await addMenuOption("main", "Retired dish", 3, false);
    const guest = await createGuest();
    await openInvitation(page, guest.token);

    const form = rsvpForm(page);
    await form.getByLabel("Happily accepts").check();
    await expect(form.getByRole("group", { name: "Main" })).toBeVisible();
    await expect(form.getByLabel("Retired dish")).toHaveCount(0);

    await saveButton(page).click();
    await expect(rsvpForm(page).getByRole("alert")).toContainText("Please choose a main.");

    await form.getByRole("group", { name: "Arrival drink" }).getByLabel("Cocktail 1").check();
    await form.getByRole("group", { name: "Starter" }).getByLabel("Soup").check();
    await form.getByRole("group", { name: "Main" }).getByLabel("Risotto").check();
    await form.getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    const guestRow = (await getRsvp(guest.id)).attendees.find((a) => a.role === "guest")!;
    expect(guestRow.arrival_drink_option_id).toBe(menu.cocktail);
    expect(guestRow.starter_option_id).toBe(menu.soup);
    expect(guestRow.main_option_id).toBe(menu.risotto);
    expect(guestRow.dessert_option_id).toBe(menu.tart);

    await page.reload();
    await expect(form.getByRole("group", { name: "Main" }).getByLabel("Risotto")).toBeChecked();
  });

  test("are hidden when declining, and earlier choices come back on accepting again", async ({ page }) => {
    const menu = await setUpMenu();
    const guest = await createGuest();
    await openInvitation(page, guest.token);
    const form = rsvpForm(page);

    await form.getByLabel("Happily accepts").check();
    await form.getByRole("group", { name: "Arrival drink" }).getByLabel("Beer").check();
    await form.getByRole("group", { name: "Starter" }).getByLabel("Soup").check();
    await form.getByRole("group", { name: "Main" }).getByLabel("Beef").check();
    await form.getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();

    await form.getByLabel("Regretfully declines").check();
    await expect(form.getByRole("group", { name: "Main" })).toHaveCount(0);
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Thank you for letting us know" })).toBeVisible();

    await page.reload();
    await form.getByLabel("Happily accepts").check();
    await expect(form.getByRole("group", { name: "Main" }).getByLabel("Beef")).toBeChecked();
    expect((await getRsvp(guest.id)).attendees[0].main_option_id).toBe(menu.beef);
  });
});

test.describe("earlier menu choices that are no longer offered", () => {
  const earlierChoices = (page: Page) => rsvpForm(page).getByTestId("earlier-choices");

  test("a switched-off option is shown read-only and can't be chosen again", async ({ page }) => {
    const menu = await setUpMenu();
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await sql("update rsvp_attendees set main_option_id = $1 where guest_id = $2", [menu.beef, guest.id]);
    await sql("update menu_options set active = false where id = $1", [menu.beef]);
    await openInvitation(page, guest.token);

    const main = rsvpForm(page).getByRole("group", { name: "Main" });
    await expect(main.getByTestId("earlier-choice")).toHaveText(
      "You chose Beef earlier, but it's no longer available. Please choose again.",
    );
    await expect(main.getByRole("radio")).toHaveCount(1);
    await expect(main.getByLabel("Beef")).toHaveCount(0);
    await expect(main.getByLabel("Risotto")).not.toBeChecked();

    await rsvpForm(page).getByRole("group", { name: "Arrival drink" }).getByLabel("Beer").check();
    await rsvpForm(page).getByRole("group", { name: "Starter" }).getByLabel("Soup").check();
    await rsvpForm(page).getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();
    await saveButton(page).click();
    await expect(rsvpForm(page).getByRole("alert")).toContainText("Please choose a main.");
    expect((await getRsvp(guest.id)).attendees[0].main_option_id).toBe(menu.beef);

    await main.getByLabel("Risotto").check();
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
    expect((await getRsvp(guest.id)).attendees[0].main_option_id).toBe(menu.risotto);
  });

  test("a choice in a switched-off category is shown read-only and kept", async ({ page }) => {
    const menu = await setUpMenu();
    const guest = await createGuest({ plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Priya Patel");
    await sql("update rsvp_attendees set starter_option_id = $1 where guest_id = $2", [menu.soup, guest.id]);
    await sql("update menu_categories set enabled = false where key = 'starter'");
    await openInvitation(page, guest.token);

    const form = rsvpForm(page);
    await expect(form.getByRole("group", { name: "Starter" })).toHaveCount(0);
    await expect(form.getByLabel("Soup")).toHaveCount(0);
    // Shown for the guest and for their plus-one, whose choices were kept too.
    await expect(earlierChoices(page)).toHaveCount(2);
    for (const block of await earlierChoices(page).all()) {
      await expect(block).toContainText("Kept from your earlier reply");
      await expect(block.getByRole("term")).toHaveText(["Starter"]);
      await expect(block.getByRole("definition")).toHaveText(["Soup"]);
    }

    for (const section of [form.getByRole("region", { name: "Your choices" }), form.getByRole("region", { name: "Your guest's choices" })]) {
      await section.getByRole("group", { name: "Arrival drink" }).getByLabel("Beer").check();
      await section.getByRole("group", { name: "Main" }).getByLabel("Risotto").check();
      await section.getByRole("group", { name: "Dessert" }).getByLabel("Lemon tart").check();
    }
    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
    const { attendees } = await getRsvp(guest.id);
    expect(attendees.map((a) => [a.role, a.starter_option_id, a.main_option_id])).toEqual([
      ["guest", menu.soup, menu.risotto],
      ["plus_one", menu.soup, menu.risotto],
    ]);
  });

  test("choices are shown read-only and kept when the whole menu is switched off", async ({ page }) => {
    const menu = await setUpMenu();
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await sql("update rsvp_attendees set main_option_id = $1, dessert_option_id = $2 where guest_id = $3", [
      menu.beef,
      menu.tart,
      guest.id,
    ]);
    await updateSettings({ menuEnabled: false });
    await openInvitation(page, guest.token);

    await expect(rsvpForm(page).getByRole("radio", { name: "Beef" })).toHaveCount(0);
    await expect(earlierChoices(page).getByRole("term")).toHaveText(["Main", "Dessert"]);
    await expect(earlierChoices(page).getByRole("definition")).toHaveText(["Beef", "Lemon tart"]);

    await saveButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
    const [row] = (await getRsvp(guest.id)).attendees;
    expect([row.main_option_id, row.dessert_option_id]).toEqual([menu.beef, menu.tart]);
  });

  test("admins see earlier choices on the guest's RSVP editor", async ({ page, context }) => {
    const menu = await setUpMenu();
    const guest = await createGuest();
    await saveRsvp(guest.id, true);
    await sql("update rsvp_attendees set main_option_id = $1, starter_option_id = $2 where guest_id = $3", [
      menu.beef,
      menu.soup,
      guest.id,
    ]);
    await sql("update menu_options set active = false where id = $1", [menu.beef]);
    await sql("update menu_categories set enabled = false where key = 'starter'");
    await signInAs(context, "approved-admin");
    await page.goto(`/admin/guests/${guest.id}`);

    const form = rsvpForm(page);
    await expect(form.getByRole("group", { name: "Main" }).getByTestId("earlier-choice")).toHaveText(
      "Beef was chosen earlier, but it's no longer available. Saving without a new choice clears it.",
    );
    await expect(earlierChoices(page)).toContainText("Kept from an earlier reply");
    await expect(earlierChoices(page).getByRole("definition")).toHaveText(["Soup"]);
  });
});
