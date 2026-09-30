import { describe, expect, it, vi } from "vitest";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { resolveGuestSession } from "./resolve";

describe("resolveGuestSession", () => {
  it("looks the guest up by the hash of the cookie, never the raw value", async () => {
    const token = generateToken();
    const lookup = vi.fn(async (hash: string) => (hash === hashToken(token) ? { id: "guest-1" } : null));
    expect(await resolveGuestSession(token, lookup)).toEqual({ id: "guest-1" });
    expect(lookup).toHaveBeenCalledWith(hashToken(token));
    expect(lookup).not.toHaveBeenCalledWith(token);
  });

  it("never queries for missing or malformed cookies, including guest ids", async () => {
    const lookup = vi.fn(async () => ({ id: "guest-1" }));
    for (const value of [undefined, "", "guest-1", "0f8fad5b-d9cb-469f-a165-70867728950e", "x".repeat(500)]) {
      expect(await resolveGuestSession(value, lookup)).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null for a well-formed but unknown session", async () => {
    expect(await resolveGuestSession(generateToken(), async () => null)).toBeNull();
  });
});
