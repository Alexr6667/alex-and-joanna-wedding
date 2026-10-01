import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/admin/preview-banner";
import { WeddingSite } from "@/components/site/wedding-site";
import { requireAdmin } from "@/lib/auth/admin";
import { isUuid } from "@/lib/guests/filters";
import { getGuest } from "@/lib/guests/service";
import { loadSiteData } from "@/lib/site/load";

export const metadata: Metadata = { title: "Guest preview | Alex & Joanna" };

/**
 * What one guest would see, rendered for an approved admin. The guest is
 * loaded on the server from the admin-only URL; no invitation token is read
 * or shown, no guest cookie is set, and the RSVP form is read-only.
 */
export default async function GuestPreviewPage({ params }: PageProps<"/admin/guests/[id]/preview">) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const guest = await getGuest(id);
  if (!guest) notFound();

  const data = await loadSiteData({
    kind: "guest-preview",
    guest: {
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      plusOneAllowed: guest.plusOneAllowed,
    },
  });
  const name = `${guest.firstName} ${guest.lastName}`;

  return (
    <WeddingSite
      {...data}
      banner={
        <PreviewBanner
          title={`Viewing as ${name}.`}
          detail={
            guest.archivedAt
              ? "This guest is archived, so their own link doesn't work. Nothing here can be saved."
              : "Nothing here can be saved."
          }
          exitHref={`/admin/guests/${guest.id}`}
          exitLabel="Exit preview"
        />
      }
    />
  );
}
