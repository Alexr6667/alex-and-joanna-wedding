"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { runAdminAction } from "@/lib/auth/admin-action";
import { AdminAuthorizationError, assertAdmin } from "@/lib/auth/admin";
import { logDatabaseError } from "@/lib/db";
import { fieldErrors } from "@/lib/settings/schema";
import { formError, saved, type FormState } from "@/lib/forms";
import { isUuid } from "@/lib/guests/filters";
import { createGuest, getGuest, setGuestArchived, updateGuest } from "@/lib/guests/service";
import { guestInputSchema } from "@/lib/guests/validation";
import { invitationUrl, renderWhatsAppMessage } from "@/lib/invitations/message";
import { issueInvitation } from "@/lib/invitations/service";
import { loadMenuForGuests } from "@/lib/menu/service";
import { saveRsvp } from "@/lib/rsvp/service";
import { validateRsvp } from "@/lib/rsvp/validation";
import { getSiteSettings } from "@/lib/settings/service";

function readGuestInput(formData: FormData) {
  return guestInputSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    familyGroupId: formData.get("familyGroupId") ?? "",
    plusOneAllowed: formData.get("plusOneAllowed"),
  });
}

function familyGroupMissing() {
  return formError("That family group no longer exists.", { familyGroupId: "Choose another group." });
}

export async function createGuestAction(_state: FormState, formData: FormData): Promise<FormState> {
  let id: string | null = null;
  const result = await runAdminAction(async () => {
    const parsed = readGuestInput(formData);
    if (!parsed.success) return formError("Please check the guest details.", fieldErrors(parsed.error));
    id = await createGuest(parsed.data);
    if (!id) return familyGroupMissing();
    return saved("Guest added.");
  });
  if (id) redirect(`/admin/guests/${id}?created=1`);
  return result;
}

export async function updateGuestAction(guestId: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(guestId)) return formError("Guest not found.");
    const parsed = readGuestInput(formData);
    if (!parsed.success) return formError("Please check the guest details.", fieldErrors(parsed.error));
    const outcome = await updateGuest(guestId, parsed.data);
    if (outcome === "family-group-missing") return familyGroupMissing();
    if (outcome === "guest-not-found") return formError("Guest not found.");
    refresh();
    return saved("Guest details saved.");
  });
}

export async function setArchivedAction(
  guestId: string,
  archived: boolean,
): Promise<FormState> {
  return runAdminAction(async () => {
    if (!isUuid(guestId) || !(await setGuestArchived(guestId, archived))) return formError("Guest not found.");
    refresh();
    return saved(
      archived ? "Guest archived. Their invitation link no longer works." : "Guest restored. Their link works again.",
    );
  });
}

export type InvitationState =
  | { status: "idle" }
  | { status: "issued"; link: string; message: string }
  | { status: "error"; message: string };

/**
 * Issues a new invitation link and returns it once. The raw token is not
 * stored anywhere; if the admin loses it, they issue another, which cancels
 * this one. The origin comes from the request, so links made on a preview
 * deployment point at that deployment.
 */
export async function issueInvitationAction(guestId: string): Promise<InvitationState> {
  try {
    await assertAdmin();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { status: "error", message: "Your admin session has ended. Please sign in again." };
    }
    throw error;
  }

  try {
    const guest = isUuid(guestId) ? await getGuest(guestId) : null;
    if (!guest) return { status: "error", message: "Guest not found." };
    if (guest.archivedAt) return { status: "error", message: "Restore this guest before creating a link." };

    const token = await issueInvitation(guestId);
    if (!token) return { status: "error", message: "Guest not found." };

    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const link = invitationUrl(`${proto}://${host}`, token);
    const settings = await getSiteSettings();
    refresh();
    return {
      status: "issued",
      link,
      message: renderWhatsAppMessage(settings.whatsappTemplate, { firstName: guest.firstName, link }),
    };
  } catch (error) {
    logDatabaseError("Issuing invitation failed", error);
    return { status: "error", message: "Something went wrong and no link was created. Please try again." };
  }
}

/** Admins can edit any guest's RSVP, including after the deadline. Menu choices are optional here. */
export async function adminSaveRsvpAction(guestId: string, _state: FormState, formData: FormData): Promise<FormState> {
  return runAdminAction(async () => {
    const guest = isUuid(guestId) ? await getGuest(guestId) : null;
    if (!guest) return formError("Guest not found.");

    const settings = await getSiteSettings();
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
        requireChoices: false,
      },
    );
    if (!result.ok) return formError("Please check the highlighted answers.", result.errors);

    const outcome = await saveRsvp(guestId, result.value, "admin");
    refresh();
    if (outcome === "guest-unavailable") return formError("Guest not found.");
    if (outcome === "plus-one-not-allowed") {
      return formError("This guest can no longer bring a plus-one, so the RSVP wasn't saved. Please check it and save again.");
    }
    return saved("RSVP saved.");
  });
}
