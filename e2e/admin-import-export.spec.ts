import { createHash, randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import Papa from "papaparse";
import { addMenuOption, createFamilyGroup, createGuest, openTransaction, saveRsvp, sql, updateSettings } from "./support/db";
import { expect, signInAs, test } from "./support/fixtures";

const HEADER = "first_name,last_name,family_group,plus_one_allowed";
const VALID_CSV = `${HEADER}
James,Smith,Smith Family,true
Sarah,Smith,Smith Family,false
David,Jones,,true
Emma,Brown,,false
`;

async function upload(page: Page, contents: string, name = "guests.csv") {
  await page.getByLabel("CSV file").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(contents) });
  await page.getByRole("button", { name: "Check file" }).click();
}

const countRows = async (table: string) => Number((await sql<{ n: string }>(`select count(*) as n from ${table}`))[0].n);
const guestCount = () => countRows("guests");
const guestNames = async () =>
  (await sql<{ name: string }>("select first_name || ' ' || last_name as name from guests order by 1")).map((row) => row.name);

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Rewrites the next POST to the import page (the confirmation) before it reaches the server. */
async function tamperWithConfirmation(page: Page, rewrite: (body: string) => string) {
  await page.route("**/admin/import", async (route) => {
    const body = route.request().postDataBuffer();
    if (route.request().method() !== "POST" || !body) return route.continue();
    await route.continue({ postData: Buffer.from(rewrite(body.toString("latin1")), "latin1") });
  });
}

/** Opens the import page in a new tab and checks a file there. */
async function checkInNewTab(page: Page, contents: string): Promise<Page> {
  const tab = await page.context().newPage();
  await tab.goto("/admin/import");
  await upload(tab, contents);
  await expect(tab.getByTestId("import-preview")).toBeVisible();
  return tab;
}

/** The success or error message shown after pressing Import. */
async function importOutcome(page: Page): Promise<string> {
  const message = page
    .getByRole("status")
    .filter({ hasText: /^Imported/ })
    .or(page.getByRole("alert").filter({ hasText: /import|duplicates|check/i }));
  await expect(message).toBeVisible({ timeout: 15_000 });
  return (await message.textContent())!.trim();
}

/**
 * Presses Import in every tab at once. A test transaction locks guest_imports
 * first, so each import is held inside its transaction until all of them are
 * in progress (the app's own import lock may queue some behind the others).
 * Then the lock is released and the imports finish.
 */
async function importAtTheSameTime(tabs: Page[]): Promise<string[]> {
  const holder = await openTransaction();
  try {
    await holder.query("lock table guest_imports in exclusive mode");
    for (const tab of tabs) await tab.getByRole("button", { name: /^Import \d/ }).click();
    await holder.waitForBlocked(tabs.length);
    await holder.commit();
  } finally {
    await holder.close();
  }
  return Promise.all(tabs.map(importOutcome));
}

test.beforeEach(async ({ context }) => {
  await signInAs(context, "approved-admin");
});

test.describe("CSV import", () => {
  test("previews without writing, then imports on confirmation", async ({ page }) => {
    await createFamilyGroup("Smith Family");
    await page.goto("/admin/import");
    await upload(page, VALID_CSV);

    const preview = page.getByTestId("import-preview");
    await expect(preview).toContainText("4 valid rows");
    await expect(preview).toContainText("Existing groups reused: Smith Family");
    await expect(preview.getByRole("row")).toHaveCount(5);
    await expect(preview.getByRole("cell", { name: "first_name" })).toHaveCount(0);
    expect(await guestCount()).toBe(0);
    expect(await countRows("guest_imports")).toBe(0);

    await page.getByRole("button", { name: "Import 4 guests" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 4 guests." })).toBeVisible();

    const rows = await sql<{ first_name: string; family: string | null; plus_one_allowed: boolean }>(
      `select g.first_name, f.name as family, g.plus_one_allowed from guests g
       left join family_groups f on f.id = g.family_group_id order by g.first_name`,
    );
    expect(rows).toEqual([
      { first_name: "David", family: null, plus_one_allowed: true },
      { first_name: "Emma", family: null, plus_one_allowed: false },
      { first_name: "James", family: "Smith Family", plus_one_allowed: true },
      { first_name: "Sarah", family: "Smith Family", plus_one_allowed: false },
    ]);
    // The existing group was reused, not duplicated.
    expect(await sql("select 1 from family_groups")).toHaveLength(1);
    // Imported guests get no invitation token until an admin creates one.
    expect(await sql("select 1 from guests where invitation_token_hash is not null")).toHaveLength(0);
  });

  test("creates missing family groups", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, VALID_CSV);
    await expect(page.getByTestId("import-preview")).toContainText("New family groups: Smith Family");
    expect(await countRows("family_groups")).toBe(0);
    await page.getByRole("button", { name: "Import 4 guests" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 4 guests." })).toBeVisible();
    expect(await sql("select 1 from family_groups where name = 'Smith Family'")).toHaveLength(1);
  });

  test("rejects a file with the wrong header", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, "first,last,group,plus\nJames,Smith,,true\n");
    await expect(page.getByTestId("import-error")).toContainText(`The first row must be exactly: ${HEADER}`);
    expect(await guestCount()).toBe(0);
  });

  test("lists invalid rows and blocks the import", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, `${HEADER}\nJames,Smith,,true\n,Jones,,false\nEmma,Brown,,maybe\n"Quoted, Name",Lee,"Lee, family",TRUE\n`);
    const invalid = page.getByTestId("invalid-rows");
    await expect(invalid).toContainText("Line 3: first_name is required");
    await expect(invalid).toContainText("Line 4: plus_one_allowed must be true or false");
    await expect(page.getByTestId("import-preview")).toContainText("2 valid rows, 2 invalid");
    await expect(page.getByRole("cell", { name: "Quoted, Name" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Import \d/ })).toHaveCount(0);
    expect(await guestCount()).toBe(0);
  });

  test("warns about duplicates and needs them acknowledged", async ({ page }) => {
    await createGuest({ firstName: "James", lastName: "Smith" });
    await page.goto("/admin/import");
    await upload(page, `${HEADER}\njames,SMITH,,false\nEmma,Brown,,false\nEmma,Brown,,true\n`);

    const warnings = page.getByTestId("duplicate-warnings");
    await expect(warnings).toContainText("will be added as separate guests, not merged");
    await expect(warnings).toContainText("Line 2, james SMITH: 1 existing guest has this name");
    await expect(warnings).toContainText("Line 3, Emma Brown: also on line 4");

    const importButton = page.getByRole("button", { name: "Import 3 guests" });
    await expect(importButton).toBeDisabled();
    await page.getByLabel("I've checked the possible duplicates").check();
    await importButton.click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 3 guests." })).toBeVisible();
    expect(await guestCount()).toBe(4);
  });

  test("the server refuses duplicates that weren't acknowledged", async ({ page }) => {
    await createGuest({ firstName: "James", lastName: "Smith" });
    await page.goto("/admin/import");
    await upload(page, `${HEADER}\nJames,Smith,,false\n`);
    await expect(page.getByTestId("duplicate-warnings")).toBeVisible();

    // Simulate a caller that skips the checkbox: tick it so the button works,
    // then strip the acknowledgement from the request before it reaches the server.
    await page.route("**/admin/import", async (route) => {
      const body = route.request().postDataBuffer();
      if (route.request().method() !== "POST" || !body) return route.continue();
      const stripped = body.toString("latin1").replaceAll("acknowledgeDuplicates", "acknowledgeDuplicatez");
      await route.continue({ postData: Buffer.from(stripped, "latin1") });
    });
    await page.getByLabel("I've checked the possible duplicates").check();
    await page.getByRole("button", { name: "Import 1 guest" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "possible duplicates" })).toBeVisible();
    expect(await guestCount()).toBe(1);
    expect(Number((await sql<{ n: string }>("select count(*) as n from guest_imports"))[0].n)).toBe(0);
  });

  test("refuses to import the same file twice", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, VALID_CSV);
    await page.getByRole("button", { name: "Import 4 guests" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 4 guests." })).toBeVisible();

    await page.reload();
    await upload(page, VALID_CSV, "guests-again.csv");
    await expect(page.getByTestId("import-preview")).toContainText("This exact file was already imported");
    await expect(page.getByRole("button", { name: /^Import \d/ })).toHaveCount(0);
    expect(await guestCount()).toBe(4);
  });
});

test.describe("CSV import confirmation", () => {
  // Same length, so rewriting one into the other keeps the request well formed.
  const CHECKED = `${HEADER}\nChecked,Person,,false\n`;
  const SMUGGLED = `${HEADER}\nSmuggle,Person,,false\n`;

  test("refuses a confirmation for a file that was never checked", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, CHECKED);
    await expect(page.getByTestId("import-preview")).toContainText("1 valid row");

    // A caller builds its own confirmation: a file that was never checked, the
    // hash of that file, and a preview reference the server never issued.
    await tamperWithConfirmation(page, (body) =>
      body.replace(CHECKED, SMUGGLED).replaceAll(sha256(CHECKED), sha256(SMUGGLED)).replace(UUID, () => randomUUID()),
    );
    await page.getByRole("button", { name: "Import 1 guest" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Check it again" })).toBeVisible();
    expect(await guestCount()).toBe(0);
    expect(await countRows("guest_imports")).toBe(0);
  });

  test("refuses a checked preview sent with different file contents", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, CHECKED);
    await expect(page.getByTestId("import-preview")).toContainText("1 valid row");

    // Keep the real preview reference but swap the file (and any hash the caller sends).
    await tamperWithConfirmation(page, (body) =>
      body.replace(CHECKED, SMUGGLED).replaceAll(sha256(CHECKED), sha256(SMUGGLED)),
    );
    await page.getByRole("button", { name: "Import 1 guest" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Check it again" })).toBeVisible();
    expect(await guestCount()).toBe(0);
    expect(await countRows("guest_imports")).toBe(0);
  });

  test("a preview belongs to the admin who checked the file", async ({ page, context }) => {
    await page.goto("/admin/import");
    await upload(page, CHECKED);
    await expect(page.getByTestId("import-preview")).toContainText("1 valid row");

    // Another approved admin confirms using the first admin's preview. Clear
    // cookies first so no cached session for the first admin is left behind.
    await context.clearCookies();
    await signInAs(context, "second-admin");
    await page.getByRole("button", { name: "Import 1 guest" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Check it again" })).toBeVisible();
    expect(await guestCount()).toBe(0);
  });

  test("a preview is used up by the import", async ({ page }) => {
    await page.goto("/admin/import");
    await upload(page, CHECKED);
    await expect(page.getByTestId("import-preview")).toContainText("1 valid row");
    expect(await countRows("guest_import_previews")).toBe(1);
    await page.getByRole("button", { name: "Import 1 guest" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 1 guest." })).toBeVisible();
    expect(await countRows("guest_import_previews")).toBe(0);
  });
});

test.describe("concurrent CSV imports", () => {
  test("overlapping names without acknowledgement: only one import goes through", async ({ page }) => {
    const first = `${HEADER}\nSam,Smith,,false\nAnn,Able,,false\n`;
    const second = `${HEADER}\nSam,Smith,,false\nBob,Baker,,false\n`;
    // Neither preview shows a duplicate: the overlap is only between the two files.
    const tabs = [await checkInNewTab(page, first), await checkInNewTab(page, second)];
    for (const tab of tabs) await expect(tab.getByTestId("duplicate-warnings")).toHaveCount(0);

    const outcomes = await importAtTheSameTime(tabs);

    expect(outcomes.filter((text) => text.startsWith("Imported 2 guests."))).toHaveLength(1);
    expect(outcomes.filter((text) => text.includes("possible duplicates"))).toHaveLength(1);
    const winner = outcomes[0].startsWith("Imported") ? ["Ann Able", "Sam Smith"] : ["Bob Baker", "Sam Smith"];
    expect(await guestNames()).toEqual(winner);
    expect(await countRows("guest_imports")).toBe(1);
  });

  test("overlapping names the admin acknowledged: both imports go through", async ({ page }) => {
    await createGuest({ firstName: "Sam", lastName: "Smith" });
    const tabs = [
      await checkInNewTab(page, `${HEADER}\nSam,Smith,,false\nAnn,Able,,false\n`),
      await checkInNewTab(page, `${HEADER}\nSam,Smith,,false\nBob,Baker,,false\n`),
    ];
    for (const tab of tabs) {
      await expect(tab.getByTestId("duplicate-warnings")).toContainText("Line 2, Sam Smith: 1 existing guest has this name");
      await tab.getByLabel("I've checked the possible duplicates").check();
    }

    const outcomes = await importAtTheSameTime(tabs);

    expect(outcomes.map((text) => text.startsWith("Imported 2 guests."))).toEqual([true, true]);
    expect(await guestNames()).toEqual(["Ann Able", "Bob Baker", "Sam Smith", "Sam Smith", "Sam Smith"]);
    expect(await countRows("guest_imports")).toBe(2);
  });

  test("an acknowledgement covers only the duplicates the admin was shown", async ({ page }) => {
    await createGuest({ firstName: "Sam", lastName: "Smith" });
    // Both previews flag Sam Smith only. Ann Able becomes a duplicate once either file is in.
    const file = (extra: string) => `${HEADER}\nSam,Smith,,false\nAnn,Able,,false\n${extra}`;
    const tabs = [await checkInNewTab(page, file("")), await checkInNewTab(page, file("Cat,Cole,,true\n"))];
    for (const tab of tabs) {
      await expect(tab.getByTestId("duplicate-warnings").getByRole("listitem")).toHaveCount(1);
      await tab.getByLabel("I've checked the possible duplicates").check();
    }

    const outcomes = await importAtTheSameTime(tabs);

    expect(outcomes.filter((text) => text.startsWith("Imported"))).toHaveLength(1);
    expect(outcomes.filter((text) => text.includes("possible duplicates"))).toHaveLength(1);
    expect((await guestNames()).filter((name) => name === "Ann Able")).toHaveLength(1);
    expect((await guestNames()).filter((name) => name === "Sam Smith")).toHaveLength(2);
    expect(await countRows("guest_imports")).toBe(1);
  });

  test("names that don't overlap: both imports go through", async ({ page }) => {
    const tabs = [
      await checkInNewTab(page, `${HEADER}\nAnn,Able,Able Family,false\nBob,Baker,,true\n`),
      await checkInNewTab(page, `${HEADER}\nCat,Cole,,false\nDan,Dunn,Able Family,false\n`),
    ];

    const outcomes = await importAtTheSameTime(tabs);

    expect(outcomes.map((text) => text.startsWith("Imported 2 guests."))).toEqual([true, true]);
    expect(await guestNames()).toEqual(["Ann Able", "Bob Baker", "Cat Cole", "Dan Dunn"]);
    // Both files name the same new family group. It is created once and shared.
    const groups = await sql<{ name: string; members: string }>(
      "select f.name, count(g.id) as members from family_groups f join guests g on g.family_group_id = f.id group by f.name",
    );
    expect(groups).toEqual([{ name: "Able Family", members: "2" }]);
    expect(await countRows("guest_imports")).toBe(2);
  });

  test("the same file imported twice at once goes in only once", async ({ page }) => {
    const tabs = [await checkInNewTab(page, VALID_CSV), await checkInNewTab(page, VALID_CSV)];

    const outcomes = await importAtTheSameTime(tabs);

    expect(outcomes.filter((text) => text.startsWith("Imported 4 guests."))).toHaveLength(1);
    expect(outcomes.filter((text) => text.includes("already been imported"))).toHaveLength(1);
    expect(await guestNames()).toEqual(["David Jones", "Emma Brown", "James Smith", "Sarah Smith"]);
    expect(await countRows("family_groups")).toBe(1);
    expect(await countRows("guest_imports")).toBe(1);
  });

  test("a failed import rolls back everything and releases the import lock", async ({ page }) => {
    // Make the guest insert fail partway through the import (test database only).
    await sql(`
      create or replace function e2e_fail_guest_insert() returns trigger language plpgsql as $$
      begin
        if new.first_name = 'Failing' then raise exception 'e2e: forced import failure'; end if;
        return new;
      end $$;
      create trigger e2e_fail_guest_insert before insert on guests for each row execute function e2e_fail_guest_insert();
    `);
    try {
      await page.goto("/admin/import");
      await upload(page, `${HEADER}\nNew,Person,Brand New Family,false\nFailing,Row,,false\n`);
      await page.getByRole("button", { name: "Import 2 guests" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "nothing was imported" })).toBeVisible();

      expect(await guestCount()).toBe(0);
      expect(await countRows("family_groups")).toBe(0);
      expect(await countRows("guest_imports")).toBe(0);
    } finally {
      await sql("drop trigger if exists e2e_fail_guest_insert on guests; drop function if exists e2e_fail_guest_insert();");
    }

    // The preview is still valid and the lock was released, so the same import now succeeds.
    await page.getByRole("button", { name: "Import 2 guests" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 2 guests." })).toBeVisible();
    expect(await guestNames()).toEqual(["Failing Row", "New Person"]);
    expect(await countRows("family_groups")).toBe(1);
    expect(await countRows("guest_imports")).toBe(1);
  });
});

test.describe("CSV export", () => {
  test("downloads guests and RSVPs without tokens", async ({ page }) => {
    await updateSettings({ menuEnabled: true });
    const beef = await addMenuOption("main", "Beef");
    const group = await createFamilyGroup("Smith Family");
    const james = await createGuest({ firstName: "James", lastName: "Smith", familyGroupId: group, plusOneAllowed: true });
    const emma = await createGuest({ firstName: "Emma", lastName: "Brown" });
    await saveRsvp(james.id, true, true, "Priya Patel");
    await sql("update rsvp_attendees set main_option_id = $1, dietary_requirements = 'No nuts' where guest_id = $2 and role = 'guest'", [
      beef,
      james.id,
    ]);
    await sql("update rsvps set notes = '=HYPERLINK(\"x\")' where guest_id = $1", [james.id]);

    await page.goto("/admin");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^wedding-guests-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = (await (await download.createReadStream()).toArray()).join("").replace(/^﻿/, "");

    expect(text).not.toContain(james.token);
    expect(text).not.toContain(emma.token);
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    expect(parsed.meta.fields).toContain("plus_one_name");
    expect(parsed.meta.fields).not.toContain("invitation_token_hash");
    const jamesRow = parsed.data.find((row) => row.first_name === "James")!;
    expect(jamesRow).toMatchObject({
      family_group: "Smith Family",
      rsvp_status: "attending",
      bringing_plus_one: "yes",
      plus_one_name: "Priya Patel",
      main: "Beef",
      dietary_requirements: "No nuts",
      notes: `'=HYPERLINK("x")`,
    });
    expect(parsed.data.find((row) => row.first_name === "Emma")!.rsvp_status).toBe("awaiting");
  });
});
