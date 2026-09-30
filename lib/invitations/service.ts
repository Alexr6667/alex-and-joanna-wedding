import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { guestSessions, guests } from "@/lib/db/schema";
import { createGuestSession } from "@/lib/guest/session";
import { generateToken, hashToken, isWellFormedToken, tokenMatchesHash } from "@/lib/security/tokens";

/**
 * Swaps an invitation token for a new guest session. Returns the raw session
 * cookie value, or null if the token is malformed, unknown, replaced, or
 * belongs to an archived guest. The caller must not say which.
 */
export async function exchangeInvitation(token: string): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;

  // Lock the guest row while the session is created. Regenerating the link or
  // archiving the guest updates the same row, so either it waits for this
  // session to exist (and then deletes it or stops it resolving), or this
  // lookup waits for it and no longer matches.
  return db.transaction(async (tx) => {
    const [guest] = await tx
      .select({ id: guests.id, hash: guests.invitationTokenHash })
      .from(guests)
      .where(and(eq(guests.invitationTokenHash, hashToken(token)), isNull(guests.archivedAt)))
      .for("update");

    // The index lookup already matched on the hash. Re-checking in constant time
    // guards against any future change to how the row is found.
    if (!guest?.hash || !tokenMatchesHash(token, guest.hash)) return null;

    return createGuestSession(guest.id, tx);
  });
}

/**
 * Issues a new invitation token for a guest. The old link stops working
 * immediately and any browser that used it is signed out. Returns the raw
 * token, which is never stored: the caller shows it once and discards it.
 */
export async function issueInvitation(guestId: string): Promise<string | null> {
  const token = generateToken();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(guests)
      .set({ invitationTokenHash: hashToken(token), invitationTokenCreatedAt: new Date(), updatedAt: new Date() })
      .where(eq(guests.id, guestId))
      .returning({ id: guests.id });
    if (updated.length === 0) return null;
    await tx.delete(guestSessions).where(eq(guestSessions.guestId, guestId));
    return token;
  });
}
