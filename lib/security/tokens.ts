import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url: 43 characters, 256 bits of entropy. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A new random token for an invitation link or a guest session cookie. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Rejects anything that could not have come from generateToken, before touching the database. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * SHA-256, hex. Tokens are 256-bit random values, so a fast unsalted hash is
 * enough: there is nothing to brute-force, and a deterministic hash lets the
 * database look a token up by index. Only this hash is stored.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two hex hashes. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Hashes `token` and compares it with a stored hash in constant time. */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  return hashesEqual(hashToken(token), storedHash);
}
