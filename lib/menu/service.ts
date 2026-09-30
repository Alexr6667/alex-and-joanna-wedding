import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuCategories, menuOptions } from "@/lib/db/schema";
import { MENU_CATEGORY_DEFAULTS } from "@/lib/settings/defaults";
import { menuQuestions, type MenuCategory, type MenuOption, type MenuQuestion } from "./logic";

export async function listMenu(): Promise<{ categories: MenuCategory[]; options: MenuOption[] }> {
  const [storedCategories, options] = await Promise.all([
    db.select().from(menuCategories).orderBy(asc(menuCategories.displayOrder)),
    db.select().from(menuOptions).orderBy(asc(menuOptions.displayOrder), asc(menuOptions.name)),
  ]);
  // Fall back to the default category list if the seed migration hasn't run.
  const categories =
    storedCategories.length > 0
      ? storedCategories
      : MENU_CATEGORY_DEFAULTS.map((category) => ({ ...category, enabled: true }));
  return {
    categories: categories.map(({ key, label, enabled, displayOrder }) => ({ key, label, enabled, displayOrder })),
    options: options.map(({ id, category, name, description, active, displayOrder }) => ({
      id,
      category,
      name,
      description,
      active,
      displayOrder,
    })),
  };
}

/**
 * Menu questions guests currently see, plus every category and a name lookup
 * for every option (active or not), so earlier choices can still be shown.
 */
export async function loadMenuForGuests(menuEnabled: boolean): Promise<{
  questions: MenuQuestion[];
  categories: MenuCategory[];
  optionNames: Record<string, string>;
}> {
  const { categories, options } = await listMenu();
  return {
    questions: menuQuestions(menuEnabled, categories, options),
    categories,
    optionNames: Object.fromEntries(options.map((option) => [option.id, option.name])),
  };
}
