import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { familyGroups, guests, rsvpAttendees, rsvps } from "@/lib/db/schema";
import { listMenu } from "@/lib/menu/service";
import { buildExportCsv, type AttendeeExport, type ExportRow } from "./csv";

type AttendeeRow = typeof rsvpAttendees.$inferSelect;

/** Every guest (archived ones marked) with their RSVP, as CSV. Tokens are never read. */
export async function exportGuestsCsv(): Promise<string> {
  const [guestRows, attendees, { options }] = await Promise.all([
    db
      .select({
        id: guests.id,
        firstName: guests.firstName,
        lastName: guests.lastName,
        familyGroup: familyGroups.name,
        archivedAt: guests.archivedAt,
        plusOneAllowed: guests.plusOneAllowed,
        attending: rsvps.attending,
        bringingPlusOne: rsvps.bringingPlusOne,
        songRequest: rsvps.songRequest,
        notes: rsvps.notes,
        respondedAt: rsvps.respondedAt,
        updatedAt: rsvps.updatedAt,
      })
      .from(guests)
      .leftJoin(familyGroups, eq(familyGroups.id, guests.familyGroupId))
      .leftJoin(rsvps, eq(rsvps.guestId, guests.id))
      .orderBy(asc(guests.lastName), asc(guests.firstName)),
    db.select().from(rsvpAttendees),
    listMenu(),
  ]);

  const optionName = new Map(options.map((option) => [option.id, option.name]));
  const name = (id: string | null) => (id ? (optionName.get(id) ?? null) : null);
  const toExport = (row: AttendeeRow): AttendeeExport => ({
    dietaryRequirements: row.dietaryRequirements,
    arrivalDrink: name(row.arrivalDrinkOptionId),
    starter: name(row.starterOptionId),
    main: name(row.mainOptionId),
    dessert: name(row.dessertOptionId),
  });
  const attendeesByKey = new Map(attendees.map((row) => [`${row.guestId}:${row.role}`, row]));
  const attendeeFor = (guestId: string, role: "guest" | "plus_one") => attendeesByKey.get(`${guestId}:${role}`);

  const rows: ExportRow[] = guestRows.map((guest) => {
    const guestAttendee = attendeeFor(guest.id, "guest");
    const plusOne = attendeeFor(guest.id, "plus_one");
    return {
      firstName: guest.firstName,
      lastName: guest.lastName,
      familyGroup: guest.familyGroup,
      archived: guest.archivedAt !== null,
      plusOneAllowed: guest.plusOneAllowed,
      attending: guest.attending,
      bringingPlusOne: guest.bringingPlusOne ?? false,
      plusOneName: plusOne?.fullName ?? null,
      guest: guestAttendee
        ? toExport(guestAttendee)
        : { dietaryRequirements: null, arrivalDrink: null, starter: null, main: null, dessert: null },
      plusOne: plusOne ? toExport(plusOne) : null,
      songRequest: guest.songRequest,
      notes: guest.notes,
      respondedAt: guest.respondedAt,
      updatedAt: guest.updatedAt,
    };
  });
  return buildExportCsv(rows);
}
