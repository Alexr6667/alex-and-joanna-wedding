"use server";

import { and, asc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { runAdminAction } from "@/lib/auth/admin-action";
import { db } from "@/lib/db";
import { menuCategories, menuOptions } from "@/lib/db/schema";
import { field, formError, saved, type FormState } from "@/lib/forms";
import { isUuid } from "@/lib/guests/filters";
import { isMenuCategoryKey } from "@/lib/menu/logic";
import { moveItem, nextDisplayOrder } from "@/lib/ordering";
import { fieldErrors, menuOptionSchema } from "@/lib/settings/schema";
import { updateSiteSettings } from "@/lib/settings/service";

export async function setMenuEnabledAction(enabled: boolean): Promise<FormState> {
  return runAdminAction(async () => {
    await updateSiteSettings({ menuEnabled: enabled });
    refresh();
    return saved(enabled ? "Guests are now asked for their choices." : "Menu questions are hidden from guests.");
  });
}

export async function updateCategoryAction(key: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isMenuCategoryKey(key)) return formError("Category not found.");
    const label = field(formData, "label").trim();
    if (!label || label.length > 60) {
      return formError("Please check the category name.", { label: "Name is required (60 characters or fewer)." });
    }
    await db
      .update(menuCategories)
      .set({ label, enabled: formData.get("enabled") === "on", updatedAt: new Date() })
      .where(eq(menuCategories.key, key));
    refresh();
    return saved("Category saved.");
  });
}

export async function addOptionAction(key: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isMenuCategoryKey(key)) return formError("Category not found.");
    const parsed = menuOptionSchema.safeParse({ name: field(formData, "name"), description: field(formData, "description") });
    if (!parsed.success) return formError("Please check the option.", fieldErrors(parsed.error));
    const existing = await db
      .select({ displayOrder: menuOptions.displayOrder })
      .from(menuOptions)
      .where(eq(menuOptions.category, key));
    await db.insert(menuOptions).values({ category: key, ...parsed.data, displayOrder: nextDisplayOrder(existing) });
    refresh();
    return saved("Option added.");
  });
}

/** Edits an option. Options are switched off rather than deleted, so earlier choices keep their name. */
export async function updateOptionAction(id: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(id)) return formError("Option not found.");
    const parsed = menuOptionSchema.safeParse({ name: field(formData, "name"), description: field(formData, "description") });
    if (!parsed.success) return formError("Please check the option.", fieldErrors(parsed.error));
    await db
      .update(menuOptions)
      .set({ ...parsed.data, active: formData.get("active") === "on", updatedAt: new Date() })
      .where(eq(menuOptions.id, id));
    refresh();
    return saved("Option saved.");
  });
}

export async function moveOptionAction(id: string, direction: "up" | "down"): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(id)) return formError("Option not found.");
    await db.transaction(async (tx) => {
      const [option] = await tx.select({ category: menuOptions.category }).from(menuOptions).where(eq(menuOptions.id, id));
      if (!option) return;
      const siblings = await tx
        .select({ id: menuOptions.id, displayOrder: menuOptions.displayOrder })
        .from(menuOptions)
        .where(eq(menuOptions.category, option.category))
        .orderBy(asc(menuOptions.displayOrder), asc(menuOptions.name));
      const numbered = siblings.map((item, index) => ({ id: item.id, displayOrder: index + 1 }));
      const final = new Map(numbered.map((item) => [item.id, item.displayOrder]));
      for (const change of moveItem(numbered, id, direction)) final.set(change.id, change.displayOrder);
      for (const item of siblings) {
        const order = final.get(item.id)!;
        if (order !== item.displayOrder) {
          await tx
            .update(menuOptions)
            .set({ displayOrder: order })
            .where(and(eq(menuOptions.id, item.id), eq(menuOptions.category, option.category)));
        }
      }
    });
    refresh();
    return saved("Order updated.");
  });
}
