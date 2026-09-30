import { createFamilyGroup, createGuest, openTransaction, saveRsvp, sql, updateSettings } from "./support/db";
import { expect, openInvitation, signInAs, test } from "./support/fixtures";

test.beforeEach(async ({ context }) => {
  await signInAs(context, "approved-admin");
});

test.describe("access control", () => {
  test("admin pages and the export refuse anonymous and unapproved users", async ({ browser }) => {
    const anonymous = await browser.newContext();
    for (const path of ["/admin/guests", "/admin/import", "/admin/settings", "/admin/menu", "/admin/content", "/admin/families"]) {
      const response = await anonymous.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(response.headers()["location"], path).toMatch(/\/admin\/login$/);
    }
    const exportResponse = await anonymous.request.get("/admin/export", { maxRedirects: 0 });
    expect(exportResponse.status()).toBeGreaterThanOrEqual(300);
    expect(exportResponse.status()).toBeLessThan(400);
    await anonymous.close();

    const unapproved = await browser.newContext();
    await signInAs(unapproved, "unapproved-user");
    const page = await unapproved.newPage();
    await page.goto("/admin/guests");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    const forbiddenExport = await unapproved.request.get("/admin/export");
    expect(forbiddenExport.status()).toBe(403);
    await unapproved.close();
  });
});

test.describe("dashboard", () => {
  test("summarises active guests and the deadline", async ({ page }) => {
    const attending = await createGuest({ firstName: "A", plusOneAllowed: true });
    const declined = await createGuest({ firstName: "B" });
    await createGuest({ firstName: "C" });
    const archived = await createGuest({ firstName: "D", archived: true });
    await saveRsvp(attending.id, true, true, "Plus One");
    await saveRsvp(declined.id, false);
    await saveRsvp(archived.id, true);
    await updateSettings({ rsvpDeadline: "2027-06-01" });

    await page.goto("/admin");
    const summary = page.getByTestId("summary");
    await expect(summary.getByText("Invited").locator("..")).toContainText("3");
    await expect(summary.getByText("Attending").locator("..")).toContainText("1");
    await expect(summary.getByText("Declined").locator("..")).toContainText("1");
    await expect(summary.getByText("Awaiting reply").locator("..")).toContainText("1");
    await expect(summary.getByText("Plus-ones coming").locator("..")).toContainText("1");
    await expect(page.getByTestId("deadline")).toHaveText("1 June 2027");
    await expect(page.getByText("1 archived guest is not counted.")).toBeVisible();
  });
});

test.describe("guest list", () => {
  test("shows an empty state", async ({ page }) => {
    await page.goto("/admin/guests");
    await expect(page.getByText("No guests yet.")).toBeVisible();
  });

  test("creates a guest", async ({ page }) => {
    await page.goto("/admin/guests");
    await page.getByText("Add a guest", { exact: true }).click();
    const form = page.getByRole("form", { name: "Add guest" });
    await form.getByRole("button", { name: "Add guest" }).click();
    await expect(form.getByText("First name is required.")).toBeVisible();

    await form.getByLabel("First name").fill("Maximilian-Alexander");
    await form.getByLabel("Last name").fill("Featherstonehaugh-Worthington");
    await form.getByLabel("Can bring a plus-one").check();
    await form.getByRole("button", { name: "Add guest" }).click();

    await expect(page.getByRole("heading", { name: "Maximilian-Alexander Featherstonehaugh-Worthington" })).toBeVisible();
    const [row] = await sql<{ plus_one_allowed: boolean; invitation_token_hash: string | null }>(
      "select plus_one_allowed, invitation_token_hash from guests",
    );
    expect(row.plus_one_allowed).toBe(true);
    expect(row.invitation_token_hash).toBeNull();
  });

  test("searches and filters", async ({ page }) => {
    const group = await createFamilyGroup("Smith Family");
    const james = await createGuest({ firstName: "James", lastName: "Smith", familyGroupId: group });
    await createGuest({ firstName: "Emma", lastName: "Brown", plusOneAllowed: true });
    await createGuest({ firstName: "Old", lastName: "Friend", archived: true });
    await saveRsvp(james.id, true);

    await page.goto("/admin/guests?q=smi");
    await expect(page.getByTestId("guest-row")).toHaveCount(1);
    await expect(page.getByTestId("guest-row")).toContainText("James Smith");

    await page.goto("/admin/guests?status=awaiting");
    await expect(page.getByTestId("guest-row")).toHaveText([/Emma Brown/]);

    await page.goto(`/admin/guests?family=${group}`);
    await expect(page.getByTestId("guest-row")).toHaveText([/James Smith/]);

    await page.goto("/admin/guests?family=none");
    await expect(page.getByTestId("guest-row")).toHaveText([/Emma Brown/]);

    await page.goto("/admin/guests?plusOne=yes");
    await expect(page.getByTestId("guest-row")).toHaveText([/Emma Brown/]);

    await page.goto("/admin/guests?archived=archived");
    await expect(page.getByTestId("guest-row")).toHaveText([/Old Friend/]);

    // The filter form drives the same query string.
    await page.goto("/admin/guests");
    await page.getByLabel("RSVP").selectOption("attending");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/status=attending/);
    await expect(page.getByTestId("guest-row")).toHaveText([/James Smith/]);
  });
});

test.describe("guest actions", () => {
  test("edits a guest and assigns a family group", async ({ page }) => {
    await createFamilyGroup("Jones Family");
    const guest = await createGuest({ firstName: "David", lastName: "Jones" });
    await page.goto(`/admin/guests/${guest.id}`);

    const form = page.getByRole("form", { name: "Guest details" });
    await form.getByLabel("First name").fill("Dave");
    await form.getByLabel("Family group").selectOption({ label: "Jones Family" });
    await form.getByRole("button", { name: "Save details" }).click();
    await expect(form.getByRole("status")).toHaveText("Guest details saved.");

    const [row] = await sql<{ first_name: string; family: string }>(
      "select g.first_name, f.name as family from guests g join family_groups f on f.id = g.family_group_id",
    );
    expect(row).toEqual({ first_name: "Dave", family: "Jones Family" });

    // Remove from the group again: the guest becomes ungrouped.
    await form.getByLabel("Family group").selectOption({ label: "No family group" });
    await form.getByRole("button", { name: "Save details" }).click();
    await expect
      .poll(async () => (await sql<{ family_group_id: string | null }>("select family_group_id from guests"))[0].family_group_id)
      .toBeNull();
  });

  test("withdrawing plus-one permission deletes plus-one details", async ({ page }) => {
    const guest = await createGuest({ plusOneAllowed: true });
    await saveRsvp(guest.id, true, true, "Former Plusone");
    await page.goto(`/admin/guests/${guest.id}`);
    const form = page.getByRole("form", { name: "Guest details" });
    await form.getByLabel("Can bring a plus-one").uncheck();
    await form.getByRole("button", { name: "Save details" }).click();
    await expect(form.getByRole("status")).toHaveText("Guest details saved.");
    const rows = await sql("select 1 from rsvp_attendees where role = 'plus_one'");
    expect(rows).toHaveLength(0);
  });

  test("archives and restores a guest", async ({ page }) => {
    const guest = await createGuest({ firstName: "Arch", lastName: "Ive" });
    await page.goto(`/admin/guests/${guest.id}`);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Archive guest" }).click();
    await expect(page.getByText("This guest is archived.")).toBeVisible();
    await page.goto(`/invite/${guest.token}`);
    await expect(page).toHaveURL(/\/invitation-not-found$/);

    await page.goto("/admin/guests");
    await expect(page.getByText("No guests yet.")).toBeVisible();
    await page.goto("/admin/guests?archived=archived");
    await expect(page.getByTestId("guest-row")).toContainText("Arch Ive");

    await page.goto(`/admin/guests/${guest.id}`);
    await page.getByRole("button", { name: "Restore guest" }).click();
    await expect(page.getByText("Guest restored.")).toBeVisible();
    await openInvitation(page, guest.token);
  });

  test("regenerating the invitation invalidates the old link", async ({ page, context }) => {
    const guest = await createGuest({ firstName: "James" });
    await page.goto(`/admin/guests/${guest.id}`);
    await expect(page.getByText("For security it can't be shown again.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Regenerate invitation link" }).click();
    const newLink = await page.getByRole("textbox", { name: "Invitation link" }).inputValue();
    expect(newLink).toMatch(/^http:\/\/localhost:3100\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(newLink).not.toContain(guest.token);

    // The old link is dead; the new one works.
    const guestBrowser = await context.browser()!.newContext();
    const guestPage = await guestBrowser.newPage();
    await guestPage.goto(`/invite/${guest.token}`);
    await expect(guestPage).toHaveURL(/\/invitation-not-found$/);
    await guestPage.goto(newLink);
    await expect(guestPage).toHaveURL(/\/$/);
    await expect(guestPage.getByText("Dear James,")).toBeVisible();
    await guestBrowser.close();

    // The link is not shown again after leaving the page.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Invitation link" })).toHaveCount(0);
  });

  test("regenerating signs out browsers that used the old link", async ({ page, browser }) => {
    const guest = await createGuest({ firstName: "Sarah" });
    const guestBrowser = await browser.newContext();
    const guestPage = await guestBrowser.newPage();
    await openInvitation(guestPage, guest.token);
    await expect(guestPage.getByText("Dear Sarah,")).toBeVisible();

    await page.goto(`/admin/guests/${guest.id}`);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Regenerate invitation link" }).click();
    await expect(page.getByRole("textbox", { name: "Invitation link" })).toBeVisible();

    await guestPage.reload();
    await expect(guestPage.getByText("This website is for invited guests")).toBeVisible();
    await guestBrowser.close();
  });

  test("copies the invitation link and WhatsApp message", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await sql(`insert into guests (first_name, last_name) values ('Emma', 'Brown')`);
    const [{ id }] = await sql<{ id: string }>("select id from guests");
    await page.goto(`/admin/guests/${id}`);

    await expect(page.getByText("No invitation link yet.")).toBeVisible();
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const link = await page.getByRole("textbox", { name: "Invitation link" }).inputValue();

    await page.getByRole("button", { name: "Copy invitation link" }).click();
    await expect(page.getByText("Invitation link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    await page.getByRole("button", { name: "Copy WhatsApp message" }).click();
    await expect(page.getByText("WhatsApp message copied.")).toBeVisible();
    const message = await page.evaluate(() => navigator.clipboard.readText());
    expect(message).toContain("Hi Emma,");
    expect(message).toContain("We're getting married on 28 August 2027");
    expect(message).toContain(link);
    expect(message).toContain("Alex & Joanna");

    // Only the hash is stored.
    const [row] = await sql<{ invitation_token_hash: string }>("select invitation_token_hash from guests");
    expect(row.invitation_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(link).not.toContain(row.invitation_token_hash);
  });
});

test.describe("family groups", () => {
  test("creates, renames and empties a group", async ({ page }) => {
    await page.goto("/admin/families");
    await expect(page.getByText("No family groups yet.")).toBeVisible();

    const create = page.getByRole("form", { name: "New family group" });
    await create.getByLabel("Name").fill("Smith Family");
    await create.getByRole("button", { name: "Create group" }).click();
    await expect(page.getByTestId("family-group")).toHaveCount(1);

    await create.getByLabel("Name").fill("smith family");
    await create.getByRole("button", { name: "Create group" }).click();
    await expect(create.getByRole("alert")).toContainText("already exists");

    const group = page.getByTestId("family-group");
    await group.getByLabel("Group name").fill("The Smiths");
    await group.getByRole("button", { name: "Rename" }).click();
    await expect(group.getByRole("status")).toHaveText("Renamed.");

    const [{ id }] = await sql<{ id: string }>("select id from family_groups");
    await createGuest({ firstName: "James", familyGroupId: id });
    await page.reload();
    await expect(page.getByTestId("family-group")).toContainText("James Smith");
    await page.getByRole("button", { name: "Remove from group" }).click();
    await expect(page.getByTestId("family-group")).toContainText("0 guests");
    const [guest] = await sql<{ family_group_id: string | null }>("select family_group_id from guests");
    expect(guest.family_group_id).toBeNull();
  });

  test("deletes an empty group", async ({ page }) => {
    const group = await createFamilyGroup("Smith Family");
    await page.goto("/admin/families");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete empty group" }).click();
    await expect(page.getByText("No family groups yet.")).toBeVisible();
    expect(await sql("select 1 from family_groups where id = $1", [group])).toHaveLength(0);
  });

  test("refuses to delete a group that gained a guest after the page loaded", async ({ page }) => {
    const group = await createFamilyGroup("Smith Family");
    await page.goto("/admin/families");
    const card = page.getByTestId("family-group");
    await expect(card).toContainText("0 guests");
    const guest = await createGuest({ firstName: "James", familyGroupId: group });

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Delete empty group" }).click();
    await expect(card.getByRole("alert")).toContainText("Move or remove this group's guests");
    expect(await sql("select 1 from family_groups where id = $1", [group])).toHaveLength(1);
    const [row] = await sql<{ family_group_id: string | null }>("select family_group_id from guests where id = $1", [
      guest.id,
    ]);
    expect(row.family_group_id).toBe(group);
  });

  // Another admin's change is in progress (not committed) when Delete is
  // pressed. The delete must wait for it, then see the guest and refuse.
  const assignments = [
    { change: "adds a guest to it", member: "Anna", statement: "insert into guests (first_name, last_name, family_group_id) values ('Anna', 'Smith', $1)" },
    { change: "moves a guest into it", member: "James", statement: "update guests set family_group_id = $1 where first_name = 'James'" },
  ];
  for (const { change, member, statement } of assignments) {
    test(`deleting a group waits for an admin who ${change}, then refuses`, async ({ page }) => {
      const group = await createFamilyGroup("Smith Family");
      await createGuest({ firstName: "James" });
      await page.goto("/admin/families");
      const card = page.getByTestId("family-group");
      await expect(card).toContainText("0 guests");

      const assignment = await openTransaction();
      try {
        await assignment.query(statement, [group]);
        page.once("dialog", (dialog) => dialog.accept());
        await card.getByRole("button", { name: "Delete empty group" }).click();
        await assignment.waitForBlocked(1);
        await assignment.commit();
      } finally {
        await assignment.close();
      }

      await expect(card.getByRole("alert")).toContainText("Move or remove this group's guests");
      expect(await sql("select 1 from family_groups where id = $1", [group])).toHaveLength(1);
      const members = await sql<{ first_name: string }>("select first_name from guests where family_group_id = $1", [group]);
      expect(members).toEqual([{ first_name: member }]);
    });
  }

  test("assigning a guest to a group that is being deleted waits, then fails cleanly", async ({ page, context }) => {
    const group = await createFamilyGroup("Smith Family");
    const guest = await createGuest({ firstName: "James" });
    await page.goto("/admin/families");
    await expect(page.getByTestId("family-group")).toContainText("0 guests");
    const editor = await context.newPage();
    await editor.goto(`/admin/guests/${guest.id}`);
    const form = editor.getByRole("form", { name: "Guest details" });
    await form.getByLabel("Family group").selectOption({ label: "Smith Family" });
    // Let prefetches finish, so nothing but the two actions queues behind the lock below.
    await page.waitForLoadState("networkidle");
    await editor.waitForLoadState("networkidle");

    // Locking the guests table pauses the app's delete after it has locked the
    // group row but before it counts the group's guests. The assignment,
    // pressed next, must then queue behind the delete: two blocked in all.
    const holder = await openTransaction();
    try {
      await holder.query("lock table guests in access exclusive mode");
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Delete empty group" }).click();
      await holder.waitForBlocked(1);
      await form.getByRole("button", { name: "Save details" }).click();
      await holder.waitForBlocked(2);
      await holder.commit();
    } finally {
      await holder.close();
    }

    await expect(page.getByText("No family groups yet.")).toBeVisible();
    await expect(form.getByRole("alert")).toContainText("That family group no longer exists.");
    expect(await sql("select 1 from family_groups where id = $1", [group])).toHaveLength(0);
    const [row] = await sql<{ family_group_id: string | null }>("select family_group_id from guests where id = $1", [
      guest.id,
    ]);
    expect(row.family_group_id).toBeNull();
  });
});
