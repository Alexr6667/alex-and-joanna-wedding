import "server-only";
import { and, asc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { familyGroups, guests, rsvps } from "@/lib/db/schema";
import { lockFamilyGroupForAssignment } from "@/lib/families/service";
import { clearPlusOne } from "@/lib/rsvp/service";
import type { GuestFilters } from "./filters";

export type GuestListItem = {
  id: string;
  firstName: string;
  lastName: string;
  familyGroupId: string | null;
  familyGroupName: string | null;
  plusOneAllowed: boolean;
  archivedAt: Date | null;
  hasInvitation: boolean;
  attending: boolean | null;
  bringingPlusOne: boolean;
};

/** Guest columns safe to send to admin pages. The token hash is never selected. */
const guestColumns = {
  id: guests.id,
  firstName: guests.firstName,
  lastName: guests.lastName,
  familyGroupId: guests.familyGroupId,
  familyGroupName: familyGroups.name,
  plusOneAllowed: guests.plusOneAllowed,
  archivedAt: guests.archivedAt,
  hasInvitation: sql<boolean>`${guests.invitationTokenHash} is not null`,
  invitationCreatedAt: guests.invitationTokenCreatedAt,
  attending: rsvps.attending,
  bringingPlusOne: sql<boolean>`coalesce(${rsvps.bringingPlusOne} and ${guests.plusOneAllowed}, false)`,
  createdAt: guests.createdAt,
  updatedAt: guests.updatedAt,
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listGuests(filters: GuestFilters): Promise<GuestListItem[]> {
  const conditions: SQL[] = [];
  if (filters.archived === "active") conditions.push(isNull(guests.archivedAt));
  if (filters.archived === "archived") conditions.push(isNotNull(guests.archivedAt));
  if (filters.status === "attending") conditions.push(eq(rsvps.attending, true));
  if (filters.status === "declined") conditions.push(eq(rsvps.attending, false));
  if (filters.status === "awaiting") conditions.push(isNull(rsvps.guestId));
  if (filters.family === "none") conditions.push(isNull(guests.familyGroupId));
  else if (filters.family) conditions.push(eq(guests.familyGroupId, filters.family));
  if (filters.plusOne === "yes") conditions.push(eq(guests.plusOneAllowed, true));
  if (filters.plusOne === "no") conditions.push(eq(guests.plusOneAllowed, false));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(
        ilike(guests.firstName, pattern),
        ilike(guests.lastName, pattern),
        ilike(sql`${guests.firstName} || ' ' || ${guests.lastName}`, pattern),
        ilike(familyGroups.name, pattern),
      )!,
    );
  }

  return db
    .select(guestColumns)
    .from(guests)
    .leftJoin(familyGroups, eq(familyGroups.id, guests.familyGroupId))
    .leftJoin(rsvps, eq(rsvps.guestId, guests.id))
    .where(and(...conditions))
    .orderBy(asc(guests.lastName), asc(guests.firstName));
}

export type GuestDetail = GuestListItem & { invitationCreatedAt: Date | null; createdAt: Date; updatedAt: Date };

export async function getGuest(id: string): Promise<GuestDetail | null> {
  const [row] = await db
    .select(guestColumns)
    .from(guests)
    .leftJoin(familyGroups, eq(familyGroups.id, guests.familyGroupId))
    .leftJoin(rsvps, eq(rsvps.guestId, guests.id))
    .where(eq(guests.id, id));
  return row ?? null;
}

export type DashboardSummary = {
  invited: number;
  attending: number;
  declined: number;
  awaiting: number;
  plusOnes: number;
  archived: number;
};

/** Counts for active (not archived) guests. */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [row] = await db
    .select({
      invited: sql<number>`count(*) filter (where ${guests.archivedAt} is null)`.mapWith(Number),
      attending: sql<number>`count(*) filter (where ${guests.archivedAt} is null and ${rsvps.attending})`.mapWith(
        Number,
      ),
      declined: sql<number>`count(*) filter (where ${guests.archivedAt} is null and not ${rsvps.attending})`.mapWith(
        Number,
      ),
      awaiting: sql<number>`count(*) filter (where ${guests.archivedAt} is null and ${rsvps.guestId} is null)`.mapWith(
        Number,
      ),
      plusOnes: sql<number>`count(*) filter (where ${guests.archivedAt} is null and ${rsvps.attending} and ${rsvps.bringingPlusOne} and ${guests.plusOneAllowed})`.mapWith(
        Number,
      ),
      archived: sql<number>`count(*) filter (where ${guests.archivedAt} is not null)`.mapWith(Number),
    })
    .from(guests)
    .leftJoin(rsvps, eq(rsvps.guestId, guests.id));
  return row;
}

export type GuestInput = {
  firstName: string;
  lastName: string;
  familyGroupId: string | null;
  plusOneAllowed: boolean;
};

/**
 * Adds a guest. Returns null, and adds nothing, if their family group no
 * longer exists. The group stays locked until the guest is in it, so it
 * can't be deleted in between.
 */
export async function createGuest(input: GuestInput): Promise<string | null> {
  return db.transaction(async (tx) => {
    if (input.familyGroupId && !(await lockFamilyGroupForAssignment(tx, input.familyGroupId))) return null;
    const [row] = await tx.insert(guests).values(input).returning({ id: guests.id });
    return row.id;
  });
}

export type UpdateGuestOutcome = "saved" | "guest-not-found" | "family-group-missing";

/**
 * Updates a guest. Withdrawing plus-one permission also deletes any plus-one
 * details. The family group is locked first, as in `createGuest`.
 */
export async function updateGuest(id: string, input: GuestInput): Promise<UpdateGuestOutcome> {
  return db.transaction(async (tx) => {
    if (input.familyGroupId && !(await lockFamilyGroupForAssignment(tx, input.familyGroupId))) {
      return "family-group-missing";
    }
    const updated = await tx
      .update(guests)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(guests.id, id))
      .returning({ id: guests.id });
    if (updated.length === 0) return "guest-not-found";
    if (!input.plusOneAllowed) await clearPlusOne(tx, id);
    return "saved";
  });
}

export async function setGuestArchived(id: string, archived: boolean): Promise<boolean> {
  const updated = await db
    .update(guests)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(guests.id, id))
    .returning({ id: guests.id });
  return updated.length > 0;
}
