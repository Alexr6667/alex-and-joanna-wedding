import type { Metadata } from "next";
import { cache } from "react";
import { InvitationOnly } from "@/components/site/invitation-only";
import { WeddingSite } from "@/components/site/wedding-site";
import { getCurrentGuest } from "@/lib/guest/session";
import { decideSiteView, type Viewer } from "@/lib/site/access";
import { loadSiteData } from "@/lib/site/load";
import { getSiteSettings } from "@/lib/settings/service";
import type { GuestIdentity } from "@/lib/guest/session";

// Shared by generateMetadata and the page, so settings are read once per request.
const resolveViewer = cache(async () => {
  const [settings, guest] = await Promise.all([getSiteSettings(), getCurrentGuest()]);
  const viewer: Viewer<GuestIdentity> = guest ? { kind: "guest", guest } : { kind: "anonymous" };
  return { settings, viewer, view: decideSiteView(settings.accessMode, viewer) };
});

/** Names the couple only for visitors who can see the site. Everyone else gets the generic layout metadata. */
export async function generateMetadata(): Promise<Metadata> {
  const { view } = await resolveViewer();
  if (view === "invitation-only") return {};
  return { title: "Alex & Joanna", description: "The wedding of Alex & Joanna" };
}

export default async function HomePage() {
  const { settings, viewer, view } = await resolveViewer();

  // Private mode: without a guest session, show nothing about the wedding.
  // Admins preview the site from /admin/preview instead of through this gate.
  if (view === "invitation-only") return <InvitationOnly />;

  const data = await loadSiteData(viewer, settings);
  return <WeddingSite {...data} />;
}
