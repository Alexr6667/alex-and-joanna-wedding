import { describe, expect, it } from "vitest";
import { generateToken, hashesEqual, hashToken, isWellFormedToken, tokenMatchesHash } from "./tokens";

describe("generateToken", () => {
  it("returns 43 base64url characters (256 bits)", () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });
});

describe("hashToken", () => {
  it("is a deterministic SHA-256 hex digest that differs from the token", () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("matches a known SHA-256 value", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("token validation", () => {
  it("accepts only generated-token shapes", () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${generateToken()}x`)).toBe(false);
    expect(isWellFormedToken("<script>alert(1)</script>xxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
    expect(isWellFormedToken(42)).toBe(false);
  });

  it("matches a token only against its own hash", () => {
    const token = generateToken();
    const other = generateToken();
    expect(tokenMatchesHash(token, hashToken(token))).toBe(true);
    expect(tokenMatchesHash(other, hashToken(token))).toBe(false);
  });

  it("compares hashes of different lengths without throwing", () => {
    expect(hashesEqual("ab", "abc")).toBe(false);
    expect(hashesEqual("abc", "abc")).toBe(true);
  });
});
