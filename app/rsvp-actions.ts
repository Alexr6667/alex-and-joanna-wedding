"use server";

import { refresh } from "next/cache";
import { formError, saved, type FormState } from "@/lib/forms";
import { getCurrentGuest } from "@/lib/guest/session";
import { loadMenuForGuests } from "@/lib/menu/service";
import { isRsvpOpen } from "@/lib/rsvp/deadline";
import { saveRsvp } from "@/lib/rsvp/service";
import { validateRsvp } from "@/lib/rsvp/validation";
import { RateLimiter } from "@/lib/security/rate-limit";
import { getSiteSettings } from "@/lib/settings/service";
import { logDatabaseError } from "@/lib/db";

// 30 saves per guest per 10 minutes is far more than a person needs.
const rsvpLimiter = new RateLimiter(30, 10 * 60 * 1000);

/**
 * Saves the signed-in guest's own RSVP. The guest comes only from the session
 * cookie. The form carries no guest id, so there is nothing to tamper with.
 * Server Actions reject cross-origin POSTs (Origin must match Host), and the
 * session cookie is SameSite=Lax, which together cover CSRF.
 */
export async function submitGuestRsvp(_state: FormState, formData: FormData): Promise<FormState> {
  const guest = await getCurrentGuest();
  if (!guest) {
    return formError("We couldn't confirm your invitation. Please open the link from your invitation again.");
  }
  if (!rsvpLimiter.hit(guest.id)) {
    return formError("Too many attempts. Please wait a few minutes and try again.");
  }

  const settings = await getSiteSettings();
  if (!isRsvpOpen(settings.rsvpDeadline, new Date())) {
    return formError("RSVPs are now closed, so your reply can't be changed online.");
  }

  const { questions } = await loadMenuForGuests(settings.menuEnabled);
  const result = validateRsvp(
    (name) => {
      const value = formData.get(name);
      return typeof value === "string" ? value : null;
    },
    {
      plusOneAllowed: guest.plusOneAllowed,
      questions,
      ask: { dietary: settings.askDietary, songRequest: settings.askSongRequest, notes: settings.askNotes },
      requireChoices: true,
    },
  );
  if (!result.ok) return formError("Please check the highlighted answers.", result.errors);

  let outcome;
  try {
    outcome = await saveRsvp(guest.id, result.value, "guest");
  } catch (error) {
    logDatabaseError("Saving RSVP failed", error);
    return formError("Sorry, something went wrong saving your reply. Please try again.");
  }
  if (outcome === "guest-unavailable") {
    return formError("We couldn't confirm your invitation. Please open the link from your invitation again.");
  }
  if (outcome === "plus-one-not-allowed") {
    refresh();
    return formError("Your invitation has changed, so your reply wasn't saved. Please check it and send it again.");
  }

  refresh();
  return saved(
    result.value.attending
      ? "Thank you. Your reply has been saved, and we can't wait to celebrate with you."
      : "Thank you for letting us know. Your reply has been saved.",
  );
}
