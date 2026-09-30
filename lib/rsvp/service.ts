import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Transaction } from "@/lib/db";
import { guests, rsvpAttendees, rsvps } from "@/lib/db/schema";
import { MENU_CATEGORY_KEYS, SELECTION_FIELD, type Selections } from "@/lib/menu/logic";
import type { AttendeeInput, RsvpSubmission } from "./validation";

export type AttendeeView = { dietaryRequirements: string | null; selections: Selections };

/** A guest's stored response, shaped for the RSVP form. */
export type RsvpView = {
  attending: boolean | null;
  bringingPlusOne: boolean;
  plusOneName: string | null;
  songRequest: string | null;
  notes: string | null;
  respondedAt: Date | null;
  updatedAt: Date | null;
  guest: AttendeeView;
  plusOne: AttendeeView;
};

type AttendeeRow = typeof rsvpAttendees.$inferSelect;

function attendeeView(row: AttendeeRow | undefined): AttendeeView {
  const selections: Selections = {};
  for (const key of MENU_CATEGORY_KEYS) selections[key] = row?.[SELECTION_FIELD[key]] ?? null;
  return { dietaryRequirements: row?.dietaryRequirements ?? null, selections };
}

export async function loadRsvp(guestId: string, plusOneAllowed: boolean): Promise<RsvpView> {
  const [[rsvp], attendees] = await Promise.all([
    db.select().from(rsvps).where(eq(rsvps.guestId, guestId)),
    db.select().from(rsvpAttendees).where(eq(rsvpAttendees.guestId, guestId)),
  ]);
  const guestRow = attendees.find((row) => row.role === "guest");
  const plusOneRow = attendees.find((row) => row.role === "plus_one");
  const bringing = plusOneAllowed && (rsvp?.bringingPlusOne ?? false);
  return {
    attending: rsvp?.attending ?? null,
    bringingPlusOne: bringing,
    plusOneName: bringing ? (plusOneRow?.fullName ?? null) : null,
    songRequest: rsvp?.songRequest ?? null,
    notes: rsvp?.notes ?? null,
    respondedAt: rsvp?.respondedAt ?? null,
    updatedAt: rsvp?.updatedAt ?? null,
    guest: attendeeView(guestRow),
    plusOne: attendeeView(bringing ? plusOneRow : undefined),
  };
}

export type SaveRsvpOutcome = "saved" | "guest-unavailable" | "plus-one-not-allowed";

/**
 * Stores a validated RSVP in one transaction. Fields the form did not ask for
 * are left as they were. Declining keeps earlier menu choices so they come
 * back if the guest changes their mind; saying "no" to a plus-one deletes the
 * plus-one's details.
 *
 * The submission was validated against the guest as they were when the
 * request started. The guest row is locked and re-checked here, so an admin
 * withdrawing plus-one permission (or archiving the guest) at the same moment
 * can't be undone by a save that was already in flight. Admins may still edit
 * an archived guest's reply.
 */
export async function saveRsvp(
  guestId: string,
  submission: RsvpSubmission,
  updatedBy: "guest" | "admin",
): Promise<SaveRsvpOutcome> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [guest] = await tx
      .select({ plusOneAllowed: guests.plusOneAllowed, archivedAt: guests.archivedAt })
      .from(guests)
      .where(eq(guests.id, guestId))
      .for("update");
    if (!guest || (updatedBy === "guest" && guest.archivedAt)) return "guest-unavailable";

    const details = submission.attendingDetails;
    if (details?.plusOne && !guest.plusOneAllowed) return "plus-one-not-allowed";

    const values = {
      attending: submission.attending,
      ...(submission.notes !== undefined && { notes: submission.notes }),
      ...(details?.songRequest !== undefined && { songRequest: details.songRequest }),
      ...(details?.plusOne !== undefined && { bringingPlusOne: details.plusOne !== null }),
      updatedAt: now,
      updatedBy,
    };
    await tx
      .insert(rsvps)
      .values({ guestId, respondedAt: now, ...values })
      .onConflictDoUpdate({ target: rsvps.guestId, set: values });

    if (!details) return "saved";
    await upsertAttendee(tx, guestId, "guest", details.guest, null, now);
    if (details.plusOne === null) {
      await deletePlusOne(tx, guestId);
    } else if (details.plusOne) {
      await upsertAttendee(tx, guestId, "plus_one", details.plusOne, details.plusOne.fullName, now);
    }
    return "saved";
  });
}

/** Removes plus-one details, for example when an admin withdraws plus-one permission. */
export async function clearPlusOne(tx: Transaction, guestId: string) {
  await tx.update(rsvps).set({ bringingPlusOne: false, updatedAt: new Date() }).where(eq(rsvps.guestId, guestId));
  await deletePlusOne(tx, guestId);
}

async function deletePlusOne(tx: Transaction, guestId: string) {
  await tx
    .delete(rsvpAttendees)
    .where(and(eq(rsvpAttendees.guestId, guestId), eq(rsvpAttendees.role, "plus_one")));
}

async function upsertAttendee(
  tx: Transaction,
  guestId: string,
  role: "guest" | "plus_one",
  input: AttendeeInput,
  fullName: string | null,
  now: Date,
) {
  const values: Partial<typeof rsvpAttendees.$inferInsert> = { fullName, updatedAt: now };
  if (input.dietaryRequirements !== undefined) values.dietaryRequirements = input.dietaryRequirements;
  for (const [key, optionId] of Object.entries(input.selections)) {
    values[SELECTION_FIELD[key as keyof typeof SELECTION_FIELD]] = optionId ?? null;
  }
  await tx
    .insert(rsvpAttendees)
    .values({ guestId, role, ...values })
    .onConflictDoUpdate({ target: [rsvpAttendees.guestId, rsvpAttendees.role], set: values });
}
