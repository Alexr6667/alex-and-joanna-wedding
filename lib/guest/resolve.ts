import { hashToken, isWellFormedToken } from "@/lib/security/tokens";

/**
 * Turns a raw guest-session cookie value into a guest. Malformed values never
 * reach the database, and the lookup only ever sees the hash, so the cookie
 * can't name a guest directly.
 */
export async function resolveGuestSession<T>(
  raw: string | undefined,
  lookup: (sessionHash: string) => Promise<T | null>,
): Promise<T | null> {
  if (!isWellFormedToken(raw)) return null;
  return lookup(hashToken(raw));
}
