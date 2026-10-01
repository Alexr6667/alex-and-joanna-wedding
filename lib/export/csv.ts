import Papa from "papaparse";

export type ExportRow = {
  firstName: string;
  lastName: string;
  familyGroup: string | null;
  archived: boolean;
  plusOneAllowed: boolean;
  attending: boolean | null;
  bringingPlusOne: boolean;
  plusOneName: string | null;
  guest: AttendeeExport;
  plusOne: AttendeeExport | null;
  songRequest: string | null;
  notes: string | null;
  respondedAt: Date | null;
  updatedAt: Date | null;
};

export type AttendeeExport = {
  dietaryRequirements: string | null;
  arrivalDrink: string | null;
  starter: string | null;
  main: string | null;
  dessert: string | null;
};

export const EXPORT_HEADERS = [
  "first_name",
  "last_name",
  "family_group",
  "archived",
  "rsvp_status",
  "plus_one_allowed",
  "bringing_plus_one",
  "plus_one_name",
  "arrival_drink",
  "starter",
  "main",
  "dessert",
  "dietary_requirements",
  "plus_one_arrival_drink",
  "plus_one_starter",
  "plus_one_main",
  "plus_one_dessert",
  "plus_one_dietary_requirements",
  "song_request",
  "notes",
  "responded_at",
  "updated_at",
] as const;

/**
 * Spreadsheet apps run cells that start with these characters as formulas.
 * Prefixing a quote keeps guest-entered text (notes, song requests) inert.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function rsvpStatus(attending: boolean | null): "attending" | "declined" | "awaiting" {
  if (attending === null) return "awaiting";
  return attending ? "attending" : "declined";
}

/**
 * Builds the guest export. Contains no invitation tokens or hashes. Menu
 * choices and plus-one details are only filled in for guests who are coming,
 * so choices kept from before a guest declined don't show up as orders.
 */
export function buildExportCsv(rows: readonly ExportRow[]): string {
  const yesNo = (value: boolean) => (value ? "yes" : "no");
  const records = rows.map((row) => {
    const coming = row.attending === true;
    const withGuest = coming && row.plusOneAllowed && row.bringingPlusOne;
    const guest = coming ? row.guest : emptyAttendee;
    const plusOne = withGuest && row.plusOne ? row.plusOne : emptyAttendee;
    const cells = [
      row.firstName,
      row.lastName,
      row.familyGroup ?? "",
      yesNo(row.archived),
      rsvpStatus(row.attending),
      yesNo(row.plusOneAllowed),
      coming ? yesNo(withGuest) : "",
      withGuest ? (row.plusOneName ?? "") : "",
      guest.arrivalDrink ?? "",
      guest.starter ?? "",
      guest.main ?? "",
      guest.dessert ?? "",
      guest.dietaryRequirements ?? "",
      plusOne.arrivalDrink ?? "",
      plusOne.starter ?? "",
      plusOne.main ?? "",
      plusOne.dessert ?? "",
      plusOne.dietaryRequirements ?? "",
      row.songRequest ?? "",
      row.notes ?? "",
      row.respondedAt?.toISOString() ?? "",
      row.updatedAt?.toISOString() ?? "",
    ];
    return cells.map(neutralizeFormula);
  });
  return Papa.unparse({ fields: [...EXPORT_HEADERS], data: records }, { newline: "\r\n" });
}

const emptyAttendee: AttendeeExport = {
  dietaryRequirements: null,
  arrivalDrink: null,
  starter: null,
  main: null,
  dessert: null,
};
