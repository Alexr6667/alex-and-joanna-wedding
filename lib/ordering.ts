export type Ordered = { id: string; displayOrder: number };

/**
 * New display orders after moving one item up or down. Returns only the items
 * whose order changed. Orders are renumbered 1..n, so gaps or ties left by
 * earlier edits are cleaned up at the same time.
 */
export function moveItem(items: readonly Ordered[], id: string, direction: "up" | "down"): Ordered[] {
  const sorted = [...items].sort((a, b) => a.displayOrder - b.displayOrder);
  const index = sorted.findIndex((item) => item.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= sorted.length) return [];
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return sorted
    .map((item, position) => ({ id: item.id, displayOrder: position + 1, previous: item.displayOrder }))
    .filter((item) => item.displayOrder !== item.previous)
    .map(({ id: itemId, displayOrder }) => ({ id: itemId, displayOrder }));
}

/** Display order for a new item added at the end. */
export function nextDisplayOrder(items: readonly Pick<Ordered, "displayOrder">[]): number {
  return items.reduce((max, item) => Math.max(max, item.displayOrder), 0) + 1;
}
