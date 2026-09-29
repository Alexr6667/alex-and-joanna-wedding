import { z } from "zod";

const emailSchema = z.email();

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses a comma-separated list of admin emails. Throws if any entry is not a
 * valid email or if the list is empty, so a typo cannot silently lock out (or
 * let in) the wrong person.
 */
export function parseAdminEmails(raw: string): readonly string[] {
  const entries = raw
    .split(",")
    .map(normalizeEmail)
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error("must contain at least one email address");
  }

  const invalid = entries.filter((entry) => !emailSchema.safeParse(entry).success);
  if (invalid.length > 0) {
    throw new Error(`contains ${invalid.length} invalid email address(es)`);
  }

  return [...new Set(entries)];
}

export function isAllowlistedEmail(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!email) return false;
  return allowlist.includes(normalizeEmail(email));
}
