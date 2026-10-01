import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildExportCsv, neutralizeFormula, type ExportRow } from "./csv";

const attendee = { dietaryRequirements: "No nuts", arrivalDrink: "Beer", starter: "Soup", main: "Beef", dessert: "Tart" };
const base: ExportRow = {
  firstName: "James",
  lastName: "Smith",
  familyGroup: "Smith Family",
  archived: false,
  plusOneAllowed: true,
  attending: true,
  bringingPlusOne: true,
  plusOneName: "Sam Lee",
  guest: attendee,
  plusOne: { ...attendee, main: "Fish" },
  songRequest: "=cmd|' /C calc'!A0",
  notes: null,
  respondedAt: new Date("2027-01-01T12:00:00Z"),
  updatedAt: new Date("2027-01-02T12:00:00Z"),
};

const parse = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true }).data;

describe("buildExportCsv", () => {
  it("exports the RSVP with plus-one details and neutralised formulas", () => {
    const [row] = parse(buildExportCsv([base]));
    expect(row).toMatchObject({
      first_name: "James",
      rsvp_status: "attending",
      bringing_plus_one: "yes",
      plus_one_name: "Sam Lee",
      main: "Beef",
      plus_one_main: "Fish",
      song_request: "'=cmd|' /C calc'!A0",
      responded_at: "2027-01-01T12:00:00.000Z",
    });
    expect(Object.keys(row).some((key) => key.includes("token"))).toBe(false);
  });

  it("leaves out kept choices for declined guests and awaiting guests", () => {
    const [declined, awaiting] = parse(
      buildExportCsv([
        { ...base, attending: false },
        { ...base, attending: null },
      ]),
    );
    expect(declined).toMatchObject({ rsvp_status: "declined", main: "", plus_one_name: "", bringing_plus_one: "" });
    expect(awaiting.rsvp_status).toBe("awaiting");
  });

  it("drops plus-one details when the plus-one is no longer allowed", () => {
    const [row] = parse(buildExportCsv([{ ...base, plusOneAllowed: false }]));
    expect(row).toMatchObject({ bringing_plus_one: "no", plus_one_name: "", plus_one_main: "" });
  });
});

describe("neutralizeFormula", () => {
  it("prefixes risky leading characters only", () => {
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("+44 7700")).toBe("'+44 7700");
    expect(neutralizeFormula("@home")).toBe("'@home");
    expect(neutralizeFormula("Plain")).toBe("Plain");
  });
});
