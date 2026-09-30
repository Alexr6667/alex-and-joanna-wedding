import { describe, expect, it } from "vitest";
import { earlierChoices, menuQuestions, summaryCategories, type MenuCategory, type MenuOption } from "./logic";

const categories: MenuCategory[] = [
  { key: "main", label: "Main", enabled: true, displayOrder: 3 },
  { key: "arrival_drink", label: "Arrival drink", enabled: true, displayOrder: 1 },
  { key: "starter", label: "Starter", enabled: false, displayOrder: 2 },
  { key: "dessert", label: "Dessert", enabled: true, displayOrder: 4 },
];

const option = (id: string, category: MenuOption["category"], displayOrder: number, active = true): MenuOption => ({
  id,
  category,
  name: id,
  description: null,
  active,
  displayOrder,
});

const options = [
  option("wine", "arrival_drink", 2),
  option("cocktail", "arrival_drink", 1),
  option("beer", "arrival_drink", 3, false),
  option("soup", "starter", 1),
  option("beef", "main", 1),
];

describe("menuQuestions", () => {
  it("asks nothing when menu choices are off", () => {
    expect(menuQuestions(false, categories, options)).toEqual([]);
  });

  it("asks enabled categories with active options, in order", () => {
    const questions = menuQuestions(true, categories, options);
    expect(questions.map((q) => q.key)).toEqual(["arrival_drink", "main"]);
    expect(questions[0].options.map((o) => o.id)).toEqual(["cocktail", "wine"]);
  });

  it("skips a category with no active options", () => {
    const questions = menuQuestions(true, categories, [option("beer", "arrival_drink", 1, false)]);
    expect(questions).toEqual([]);
  });
});

describe("summaryCategories", () => {
  const keys = (rows: { key: string }[]) => rows.map((row) => row.key);

  it("lists the categories guests are asked about now, in display order", () => {
    const questions = menuQuestions(true, categories, options);
    expect(keys(summaryCategories(categories, questions, {}))).toEqual(["arrival_drink", "main"]);
  });

  it("keeps a category holding an earlier choice after it is switched off", () => {
    const questions = menuQuestions(true, categories, options);
    expect(keys(summaryCategories(categories, questions, { starter: "soup" }))).toEqual([
      "arrival_drink",
      "starter",
      "main",
    ]);
  });

  it("keeps earlier choices when the whole menu is switched off", () => {
    expect(summaryCategories(categories, [], { dessert: "retired-tart", main: null })).toEqual([
      { key: "dessert", label: "Dessert" },
    ]);
  });
});

describe("earlierChoices", () => {
  const questions = menuQuestions(true, categories, options);

  it("is empty when every stored choice is still offered", () => {
    expect(earlierChoices(categories, questions, { arrival_drink: "wine", main: "beef", dessert: null })).toEqual([]);
  });

  it("flags a switched-off option in a category that is still asked", () => {
    expect(earlierChoices(categories, questions, { arrival_drink: "beer" })).toEqual([
      { key: "arrival_drink", label: "Arrival drink", optionId: "beer", asked: true },
    ]);
  });

  it("flags a choice in a switched-off category as not asked", () => {
    expect(earlierChoices(categories, questions, { starter: "soup", main: "beef" })).toEqual([
      { key: "starter", label: "Starter", optionId: "soup", asked: false },
    ]);
  });

  it("flags every stored choice when the whole menu is switched off, in display order", () => {
    const none = menuQuestions(false, categories, options);
    expect(earlierChoices(categories, none, { main: "beef", arrival_drink: "wine", dessert: null })).toEqual([
      { key: "arrival_drink", label: "Arrival drink", optionId: "wine", asked: false },
      { key: "main", label: "Main", optionId: "beef", asked: false },
    ]);
  });
});
