import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { db, type Transaction } from "@/lib/db";
import { familyGroups, guests } from "@/lib/db/schema";

export type FamilyGroupSummary = { id: string; name: string; members: number };

export async function listFamilyGroups(): Promise<FamilyGroupSummary[]> {
  return db
    .select({
      id: familyGroups.id,
      name: familyGroups.name,
      members: sql<number>`count(${guests.id}) filter (where ${guests.archivedAt} is null)`.mapWith(Number),
    })
    .from(familyGroups)
    .leftJoin(guests, eq(guests.familyGroupId, familyGroups.id))
    .groupBy(familyGroups.id)
    .orderBy(asc(familyGroups.name));
}

export type FamilyGroupResult = { ok: true; id: string } | { ok: false; error: string };

function postgresErrorCode(error: unknown) {
  // node-postgres errors can be wrapped by Drizzle; check the cause as well.
  return (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
}

function isUniqueViolation(error: unknown) {
  return postgresErrorCode(error) === "23505";
}

function isForeignKeyViolation(error: unknown) {
  return postgresErrorCode(error) === "23503";
}

export async function createFamilyGroup(name: string): Promise<FamilyGroupResult> {
  try {
    const [row] = await db.insert(familyGroups).values({ name }).returning({ id: familyGroups.id });
    return { ok: true, id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "A family group with that name already exists." };
    throw error;
  }
}

export async function renameFamilyGroup(id: string, name: string): Promise<FamilyGroupResult> {
  try {
    const updated = await db
      .update(familyGroups)
      .set({ name, updatedAt: new Date() })
      .where(eq(familyGroups.id, id))
      .returning({ id: familyGroups.id });
    return updated.length > 0 ? { ok: true, id } : { ok: false, error: "That family group no longer exists." };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "A family group with that name already exists." };
    throw error;
  }
}

/**
 * Deletes an empty group. Guests are never deleted with it.
 *
 * The group row is locked (FOR UPDATE) before its members are counted. Adding
 * a guest to a group takes a FOR KEY SHARE lock on the same row (the foreign
 * key check does, and `lockFamilyGroupForAssignment` does it explicitly), and
 * the two conflict. So an assignment still in progress makes this wait and
 * then count its guest, and an assignment that starts after this waits and
 * then finds the group gone. Without the lock, the delete could follow an
 * assignment that committed after the count, and ON DELETE SET NULL would
 * silently ungroup that guest.
 */
export async function deleteFamilyGroup(id: string): Promise<FamilyGroupResult> {
  return db.transaction(async (tx): Promise<FamilyGroupResult> => {
    const [group] = await tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(eq(familyGroups.id, id))
      .for("update");
    if (!group) return { ok: false, error: "That family group no longer exists." };

    const [{ n }] = await tx.select({ n: count() }).from(guests).where(eq(guests.familyGroupId, id));
    if (n > 0) return { ok: false, error: "Move or remove this group's guests (including archived ones) first." };

    await tx.delete(familyGroups).where(eq(familyGroups.id, id));
    return { ok: true, id };
  });
}

/**
 * Locks a group so it can't be deleted before this transaction ends, and
 * reports whether it still exists. Call it before writing a guest into the
 * group. If a delete holds the group, this waits for it and returns false.
 */
export async function lockFamilyGroupForAssignment(tx: Transaction, id: string): Promise<boolean> {
  const [group] = await tx
    .select({ id: familyGroups.id })
    .from(familyGroups)
    .where(eq(familyGroups.id, id))
    .for("key share");
  return !!group;
}

export async function setGuestFamilyGroup(guestId: string, familyGroupId: string | null) {
  await db.update(guests).set({ familyGroupId, updatedAt: new Date() }).where(eq(guests.id, guestId));
}

export { isForeignKeyViolation, isUniqueViolation };
