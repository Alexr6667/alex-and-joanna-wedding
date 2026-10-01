export const MENU_CATEGORY_KEYS = ["arrival_drink", "starter", "main", "dessert"] as const;
export type MenuCategoryKey = (typeof MENU_CATEGORY_KEYS)[number];

export type MenuCategory = { key: MenuCategoryKey; label: string; enabled: boolean; displayOrder: number };
export type MenuOption = {
  id: string;
  category: MenuCategoryKey;
  name: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
};

/** A category as a guest sees it: only active options, in display order. */
export type MenuQuestion = {
  key: MenuCategoryKey;
  label: string;
  options: { id: string; name: string; description: string | null }[];
};

/** The attendee column that stores each category's choice. */
export const SELECTION_FIELD = {
  arrival_drink: "arrivalDrinkOptionId",
  starter: "starterOptionId",
  main: "mainOptionId",
  dessert: "dessertOptionId",
} as const satisfies Record<MenuCategoryKey, string>;

export type Selections = Partial<Record<MenuCategoryKey, string | null>>;

export function isMenuCategoryKey(value: unknown): value is MenuCategoryKey {
  return typeof value === "string" && (MENU_CATEGORY_KEYS as readonly string[]).includes(value);
}

/**
 * The food and drink questions guests are asked. Empty when menu choices are
 * switched off. A category appears only if it is enabled and has at least one
 * active option.
 */
export function menuQuestions(
  menuEnabled: boolean,
  categories: readonly MenuCategory[],
  options: readonly MenuOption[],
): MenuQuestion[] {
  if (!menuEnabled) return [];
  return [...categories]
    .filter((category) => category.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((category) => ({
      key: category.key,
      label: category.label,
      options: options
        .filter((option) => option.category === category.key && option.active)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
        .map(({ id, name, description }) => ({ id, name, description })),
    }))
    .filter((question) => question.options.length > 0);
}

/**
 * The menu rows for a stored reply: every category the guest is asked about
 * now, plus any category holding an earlier choice, even if that category or
 * its options have since been switched off. The choice itself is kept, so the
 * guest should still see it.
 */
export function summaryCategories(
  categories: readonly MenuCategory[],
  questions: readonly MenuQuestion[],
  selections: Selections,
): { key: MenuCategoryKey; label: string }[] {
  const asked = new Set(questions.map((question) => question.key));
  return [...categories]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .filter((category) => asked.has(category.key) || selections[category.key])
    .map(({ key, label }) => ({ key, label }));
}

/** A stored choice the RSVP form can no longer offer as an option. */
export type EarlierChoice = {
  key: MenuCategoryKey;
  label: string;
  optionId: string;
  /**
   * True if the category is still asked (only the option was switched off),
   * so the guest must choose again. False if the category or the whole menu
   * is switched off, in which case the stored choice is kept as it is.
   */
  asked: boolean;
};

/**
 * Stored choices that aren't among the options the form offers now, in
 * category display order. The form shows these read-only, so an earlier reply
 * stays visible without the withdrawn option becoming selectable again.
 */
export function earlierChoices(
  categories: readonly MenuCategory[],
  questions: readonly MenuQuestion[],
  selections: Selections,
): EarlierChoice[] {
  const questionByKey = new Map(questions.map((question) => [question.key, question]));
  return [...categories]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .flatMap((category) => {
      const optionId = selections[category.key];
      if (!optionId) return [];
      const question = questionByKey.get(category.key);
      if (question?.options.some((option) => option.id === optionId)) return [];
      return [{ key: category.key, label: category.label, optionId, asked: question !== undefined }];
    });
}
