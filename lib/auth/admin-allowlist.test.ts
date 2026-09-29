import { describe, expect, it } from "vitest";
import { isAllowlistedEmail, parseAdminEmails } from "./admin-allowlist";

describe("parseAdminEmails", () => {
  it("trims, lowercases, drops empty entries and de-duplicates", () => {
    expect(parseAdminEmails(" Alex@Example.com ,joanna@example.com,, alex@example.com ")).toEqual([
      "alex@example.com",
      "joanna@example.com",
    ]);
  });

  it("throws when the list is empty", () => {
    expect(() => parseAdminEmails("")).toThrow("at least one");
  });

  it("throws when any entry is not an email", () => {
    expect(() => parseAdminEmails("alex@example.com,joanna")).toThrow("invalid");
  });
});

describe("isAllowlistedEmail", () => {
  const allowlist = parseAdminEmails("alex@example.com,joanna@example.com");

  it("matches approved emails regardless of case and surrounding space", () => {
    expect(isAllowlistedEmail("alex@example.com", allowlist)).toBe(true);
    expect(isAllowlistedEmail("  JOANNA@example.COM ", allowlist)).toBe(true);
  });

  it("rejects other addresses, including near-misses", () => {
    expect(isAllowlistedEmail("guest@example.com", allowlist)).toBe(false);
    expect(isAllowlistedEmail("alex@example.com.evil.test", allowlist)).toBe(false);
    expect(isAllowlistedEmail("xalex@example.com", allowlist)).toBe(false);
  });

  it("rejects missing emails", () => {
    expect(isAllowlistedEmail(undefined, allowlist)).toBe(false);
    expect(isAllowlistedEmail(null, allowlist)).toBe(false);
    expect(isAllowlistedEmail("", allowlist)).toBe(false);
  });
});
