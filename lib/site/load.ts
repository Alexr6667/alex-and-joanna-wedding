import "server-only";
import type { RsvpSectionProps } from "@/components/site/rsvp-section";
import type { GuestIdentity } from "@/lib/guest/session";
import { loadMenuForGuests } from "@/lib/menu/service";
import { isRsvpOpen } from "@/lib/rsvp/deadline";
import { loadRsvp } from "@/lib/rsvp/service";
import { getSiteSettings, listFaqEntries, type FaqEntry, type SiteSettings } from "@/lib/settings/service";
import type { Viewer } from "./access";

export type SiteData = { settings: SiteSettings; faqs: FaqEntry[]; rsvp: RsvpSectionProps };

/**
 * Everything the wedding page needs for one viewer. General content is the
 * same for everyone. RSVP data is loaded only for a guest (or a guest preview)
 * and only for that guest.
 */
export async function loadSiteData(
  viewer: Viewer<GuestIdentity>,
  settings?: SiteSettings,
): Promise<SiteData> {
  const [resolvedSettings, faqs] = await Promise.all([settings ?? getSiteSettings(), listFaqEntries()]);
  return { settings: resolvedSettings, faqs, rsvp: await rsvpProps(viewer, resolvedSettings) };
}

async function rsvpProps(viewer: Viewer<GuestIdentity>, settings: SiteSettings): Promise<RsvpSectionProps> {
  if (viewer.kind === "anonymous" || viewer.kind === "admin-preview") return { kind: viewer.kind };

  const { guest } = viewer;
  const [view, menu] = await Promise.all([
    loadRsvp(guest.id, guest.plusOneAllowed),
    loadMenuForGuests(settings.menuEnabled),
  ]);
  return {
    kind: viewer.kind,
    firstName: guest.firstName,
    plusOneAllowed: guest.plusOneAllowed,
    view,
    questions: menu.questions,
    menuCategories: menu.categories,
    optionNames: menu.optionNames,
    ask: { dietary: settings.askDietary, songRequest: settings.askSongRequest, notes: settings.askNotes },
    open: isRsvpOpen(settings.rsvpDeadline, new Date()),
    deadline: settings.rsvpDeadline,
  };
}
