import { describe, expect, it } from "vitest";
import {
  findDuplicates,
  nameKey,
  parseBoolean,
  parseGuestCsv,
  planFamilyGroups,
  unacknowledgedDuplicateLines,
  type DuplicateWarning,
  type ImportRow,
} from "./csv";

const HEADER = "first_name,last_name,family_group,plus_one_allowed";

describe("parseGuestCsv", () => {
  it("parses the example file and never imports the header row", () => {
    const result = parseGuestCsv(
      `${HEADER}\nJames,Smith,Smith Family,true\nSarah,Smith,Smith Family,false\nDavid,Jones,,true\nEmma,Brown,,false\n`,
    );
    expect(result).toEqual({
      ok: true,
      invalid: [],
      rows: [
        { line: 2, firstName: "James", lastName: "Smith", familyGroup: "Smith Family", plusOneAllowed: true },
        { line: 3, firstName: "Sarah", lastName: "Smith", familyGroup: "Smith Family", plusOneAllowed: false },
        { line: 4, firstName: "David", lastName: "Jones", familyGroup: null, plusOneAllowed: true },
        { line: 5, firstName: "Emma", lastName: "Brown", familyGroup: null, plusOneAllowed: false },
      ],
    });
  });

  it("handles quotes, commas in fields, CRLF, a BOM and blank lines", () => {
    const result = parseGuestCsv(`﻿${HEADER}\r\n"Mary, Jr",O'Neil,"The ""Big"" Family",TRUE\r\n\r\n`);
    expect(result.ok && result.rows).toEqual([
      { line: 2, firstName: "Mary, Jr", lastName: "O'Neil", familyGroup: 'The "Big" Family', plusOneAllowed: true },
    ]);
  });

  it("rejects a wrong or missing header", () => {
    expect(parseGuestCsv("first,last,group,plus\nA,B,,true")).toMatchObject({ ok: false });
    expect(parseGuestCsv("James,Smith,,true\n")).toMatchObject({ ok: false });
    expect(parseGuestCsv(`${HEADER},extra\nA,B,,true,x`)).toMatchObject({ ok: false });
  });

  it("rejects a header that only matches once its cells are joined or trimmed", () => {
    expect(parseGuestCsv(`"${HEADER}"\nA,B,,true`)).toMatchObject({ ok: false });
    expect(parseGuestCsv(" first_name , last_name,family_group,plus_one_allowed\nA,B,,true")).toMatchObject({
      ok: false,
    });
  });

  it("rejects empty files and header-only files", () => {
    expect(parseGuestCsv("")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseGuestCsv(`${HEADER}\n`)).toEqual({ ok: false, error: "The file has a header row but no guests." });
  });

  it("reports every problem on invalid rows", () => {
    const result = parseGuestCsv(`${HEADER}\n,Smith,,yes\nJames,,,\nOnly,Three,Columns\n`);
    expect(result.ok && result.invalid).toEqual([
      { line: 2, values: ["", "Smith", "", "yes"], problems: ["first_name is required", "plus_one_allowed must be true or false"] },
      { line: 3, values: ["James", "", "", ""], problems: ["last_name is required", "plus_one_allowed must be true or false"] },
      { line: 4, values: ["Only", "Three", "Columns"], problems: ["has 3 columns, expected 4"] },
    ]);
  });

  it("rejects an unclosed quote", () => {
    expect(parseGuestCsv(`${HEADER}\n"James,Smith,,true\n`)).toMatchObject({ ok: false });
  });
});

describe("parseBoolean", () => {
  it("accepts only explicit true or false", () => {
    expect(parseBoolean(" TRUE ")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
    for (const value of ["", "yes", "no", "1", "0", "t"]) expect(parseBoolean(value)).toBeNull();
  });
});

const row = (line: number, firstName: string, lastName: string, familyGroup: string | null = null): ImportRow => ({
  line,
  firstName,
  lastName,
  familyGroup,
  plusOneAllowed: false,
});

describe("findDuplicates", () => {
  it("flags repeats in the file and names that already exist, ignoring case and spacing", () => {
    expect(nameKey(" James ", "SMITH")).toBe(nameKey("james", "smith"));
    const warnings = findDuplicates(
      [row(2, "James", "Smith"), row(3, "Emma", "Brown"), row(4, "emma", "brown"), row(5, "David", "Jones")],
      [{ firstName: "JAMES", lastName: "smith" }],
    );
    expect(warnings).toEqual([
      { line: 2, name: "James Smith", sameFileLines: [], existingGuests: 1 },
      { line: 3, name: "Emma Brown", sameFileLines: [4], existingGuests: 0 },
      { line: 4, name: "emma brown", sameFileLines: [3], existingGuests: 0 },
    ]);
  });
});

describe("unacknowledgedDuplicateLines", () => {
  const warning = (line: number): DuplicateWarning => ({ line, name: "Sam Smith", sameFileLines: [], existingGuests: 1 });

  it("is empty when every flagged line was shown in the preview", () => {
    expect(unacknowledgedDuplicateLines([warning(2), warning(4)], [2, 4])).toEqual([]);
  });

  it("is empty when nothing is flagged", () => {
    expect(unacknowledgedDuplicateLines([], [])).toEqual([]);
  });

  it("lists lines flagged since the preview", () => {
    expect(unacknowledgedDuplicateLines([warning(2), warning(3)], [2])).toEqual([3]);
    expect(unacknowledgedDuplicateLines([warning(3)], [])).toEqual([3]);
  });
});

describe("planFamilyGroups", () => {
  it("reuses existing groups case-insensitively, creates each new one once, and leaves blanks ungrouped", () => {
    const plan = planFamilyGroups(
      [row(2, "A", "A", "Smith Family"), row(3, "B", "B", "jones family"), row(4, "C", "C", "Jones Family"), row(5, "D", "D")],
      [{ id: "smith-id", name: "Smith family" }],
    );
    expect(plan.create).toEqual(["jones family"]);
    expect(plan.resolve("SMITH FAMILY")).toEqual({ existingId: "smith-id" });
    expect(plan.resolve("Jones Family")).toEqual({ newName: "jones family" });
    expect(plan.resolve(null)).toBeNull();
  });
});
