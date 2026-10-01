import Papa from "papaparse";

export const EXPECTED_HEADERS = ["first_name", "last_name", "family_group", "plus_one_allowed"] as const;
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 256 * 1024;
const MAX_NAME = 100;
const MAX_GROUP = 120;

export type ImportRow = {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  firstName: string;
  lastName: string;
  familyGroup: string | null;
  plusOneAllowed: boolean;
};

export type InvalidRow = { line: number; values: string[]; problems: string[] };

export type ParsedCsv =
  | { ok: true; rows: ImportRow[]; invalid: InvalidRow[] }
  | { ok: false; error: string };

/**
 * Parses a guest CSV with a real CSV parser (quoted fields, commas and line
 * breaks inside quotes). The first row is always the header and is never
 * imported. It must be exactly `first_name,last_name,family_group,plus_one_allowed`.
 */
export function parseGuestCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { ok: false, error: "The file is empty." };

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const fatal = parsed.errors.find((error) => error.type === "Quotes");
  if (fatal) {
    return { ok: false, error: `The file isn't valid CSV (unclosed quote near line ${(fatal.row ?? 0) + 1}).` };
  }

  const [header, ...body] = parsed.data;
  // Compare cell by cell. Joining the cells would accept the whole header
  // quoted as one field, and trimming would accept padded names.
  const headerMatches =
    header?.length === EXPECTED_HEADERS.length && EXPECTED_HEADERS.every((name, index) => header[index] === name);
  if (!headerMatches) {
    return {
      ok: false,
      error: `The first row must be exactly: ${EXPECTED_HEADERS.join(",")}`,
    };
  }
  if (body.length === 0) return { ok: false, error: "The file has a header row but no guests." };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `The file has ${body.length} guests. The limit is ${MAX_IMPORT_ROWS} per import.` };
  }

  const rows: ImportRow[] = [];
  const invalid: InvalidRow[] = [];

  // Line numbers are approximate if a quoted field spans lines, but match the
  // row a spreadsheet shows for normal files.
  body.forEach((cells, index) => {
    const line = index + 2;
    const problems: string[] = [];
    if (cells.length !== EXPECTED_HEADERS.length) {
      problems.push(`has ${cells.length} columns, expected ${EXPECTED_HEADERS.length}`);
      invalid.push({ line, values: cells, problems });
      return;
    }

    const [firstName, lastName, familyGroup, plusOne] = cells.map((cell) => cell.trim());
    if (!firstName) problems.push("first_name is required");
    if (!lastName) problems.push("last_name is required");
    if (firstName.length > MAX_NAME) problems.push(`first_name is longer than ${MAX_NAME} characters`);
    if (lastName.length > MAX_NAME) problems.push(`last_name is longer than ${MAX_NAME} characters`);
    if (familyGroup.length > MAX_GROUP) problems.push(`family_group is longer than ${MAX_GROUP} characters`);
    const plusOneAllowed = parseBoolean(plusOne);
    if (plusOneAllowed === null) problems.push("plus_one_allowed must be true or false");

    if (problems.length > 0) {
      invalid.push({ line, values: cells, problems });
    } else {
      rows.push({
        line,
        firstName,
        lastName,
        familyGroup: familyGroup === "" ? null : familyGroup,
        plusOneAllowed: plusOneAllowed!,
      });
    }
  });

  return { ok: true, rows, invalid };
}

/** Only an explicit `true` or `false` (any case). Blank, yes/no and 1/0 are rejected. */
export function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

/** Case- and whitespace-insensitive key used to spot the same name twice. */
export function nameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export type DuplicateWarning = {
  line: number;
  name: string;
  /** Other lines in this file with the same name. */
  sameFileLines: number[];
  /** Number of existing guests (including archived) with the same name. */
  existingGuests: number;
};

/**
 * Warnings for names that appear more than once in the file or already exist.
 * Duplicates are still imported as separate guests if the admin confirms:
 * two people can share a name, so nothing is merged automatically.
 */
export function findDuplicates(
  rows: readonly ImportRow[],
  existing: readonly { firstName: string; lastName: string }[],
): DuplicateWarning[] {
  const existingCounts = new Map<string, number>();
  for (const guest of existing) {
    const key = nameKey(guest.firstName, guest.lastName);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const linesByName = new Map<string, number[]>();
  for (const row of rows) {
    const key = nameKey(row.firstName, row.lastName);
    linesByName.set(key, [...(linesByName.get(key) ?? []), row.line]);
  }

  const warnings: DuplicateWarning[] = [];
  for (const row of rows) {
    const key = nameKey(row.firstName, row.lastName);
    const sameFileLines = (linesByName.get(key) ?? []).filter((line) => line !== row.line);
    const existingGuests = existingCounts.get(key) ?? 0;
    if (sameFileLines.length > 0 || existingGuests > 0) {
      warnings.push({ line: row.line, name: `${row.firstName} ${row.lastName}`, sameFileLines, existingGuests });
    }
  }
  return warnings;
}

/**
 * Lines flagged as possible duplicates now that were not flagged when the
 * admin checked the file. Their acknowledgement doesn't cover these, for
 * example names another import added in the meantime.
 */
export function unacknowledgedDuplicateLines(
  current: readonly DuplicateWarning[],
  previewedLines: readonly number[],
): number[] {
  const acknowledged = new Set(previewedLines);
  return current.map((warning) => warning.line).filter((line) => !acknowledged.has(line));
}

export type FamilyGroupPlan = {
  /** Distinct new group names to create, in first-seen order and spelling. */
  create: string[];
  /** Maps each row's group name (lowercased) to an existing group id, or to the new name. */
  resolve: (name: string | null) => { existingId: string } | { newName: string } | null;
};

/**
 * Works out which family groups to reuse and which to create. Matching is
 * case-insensitive, like the database's unique index on group names.
 */
export function planFamilyGroups(
  rows: readonly ImportRow[],
  existing: readonly { id: string; name: string }[],
): FamilyGroupPlan {
  const existingByKey = new Map(existing.map((group) => [group.name.trim().toLowerCase(), group.id]));
  const newByKey = new Map<string, string>();
  for (const row of rows) {
    if (!row.familyGroup) continue;
    const key = row.familyGroup.toLowerCase();
    if (!existingByKey.has(key) && !newByKey.has(key)) newByKey.set(key, row.familyGroup);
  }

  return {
    create: [...newByKey.values()],
    resolve(name) {
      if (!name) return null;
      const key = name.toLowerCase();
      const existingId = existingByKey.get(key);
      if (existingId) return { existingId };
      return { newName: newByKey.get(key) ?? name };
    },
  };
}
