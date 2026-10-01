import { describe, expect, it } from "vitest";
import { moveItem, nextDisplayOrder } from "./ordering";

const items = [
  { id: "a", displayOrder: 1 },
  { id: "b", displayOrder: 2 },
  { id: "c", displayOrder: 3 },
];

describe("moveItem", () => {
  it("swaps with the neighbour", () => {
    expect(moveItem(items, "b", "up")).toEqual([
      { id: "b", displayOrder: 1 },
      { id: "a", displayOrder: 2 },
    ]);
    expect(moveItem(items, "b", "down")).toEqual([
      { id: "c", displayOrder: 2 },
      { id: "b", displayOrder: 3 },
    ]);
  });

  it("does nothing at the ends or for unknown ids", () => {
    expect(moveItem(items, "a", "up")).toEqual([]);
    expect(moveItem(items, "c", "down")).toEqual([]);
    expect(moveItem(items, "z", "up")).toEqual([]);
  });

  it("renumbers gaps while moving", () => {
    const gappy = [
      { id: "a", displayOrder: 10 },
      { id: "b", displayOrder: 20 },
    ];
    expect(moveItem(gappy, "b", "up")).toEqual([
      { id: "b", displayOrder: 1 },
      { id: "a", displayOrder: 2 },
    ]);
  });

  it("appends after the highest order", () => {
    expect(nextDisplayOrder(items)).toBe(4);
    expect(nextDisplayOrder([])).toBe(1);
  });
});
