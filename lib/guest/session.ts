import "server-only";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, type Transaction } from "@/lib/db";
import { guestSessions, guests } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { GUEST_COOKIE, GUEST_SESSION_MAX_AGE_SECONDS } from "./cookie";
import { resolveGuestSession } from "./resolve";

/** The invited guest behind the current request. Never includes token hashes. */
export type GuestIdentity = {
  id: string;
  firstName: string;
  lastName: string;
  plusOneAllowed: boolean;
};

/**
 * Resolves the guest from the session cookie. The cookie holds only a random
 * value; the guest id comes from the database row it hashes to, so a visitor
 * cannot pick which guest they are. Archived guests and expired sessions
 * resolve to null.
 */
export const getCurrentGuest = cache(async (): Promise<GuestIdentity | null> =>
  resolveGuestSession((await cookies()).get(GUEST_COOKIE.name)?.value, findGuestBySessionHash),
);

async function findGuestBySessionHash(sessionHash: string): Promise<GuestIdentity | null> {
  const [row] = await db
    .select({
      id: guests.id,
      firstName: guests.firstName,
      lastName: guests.lastName,
      plusOneAllowed: guests.plusOneAllowed,
    })
    .from(guestSessions)
    .innerJoin(guests, eq(guests.id, guestSessions.guestId))
    .where(
      and(
        eq(guestSessions.tokenHash, sessionHash),
        gt(guestSessions.expiresAt, new Date()),
        isNull(guests.archivedAt),
      ),
    );
  return row ?? null;
}

/** Creates a session row for a guest and returns the raw cookie value. */
export async function createGuestSession(guestId: string, tx: Transaction): Promise<string> {
  const token = generateToken();
  const now = new Date();
  await tx.insert(guestSessions).values({
    guestId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + GUEST_SESSION_MAX_AGE_SECONDS * 1000),
  });
  // Housekeeping: drop expired sessions for everyone.
  await tx.delete(guestSessions).where(lt(guestSessions.expiresAt, now));
  return token;
}
