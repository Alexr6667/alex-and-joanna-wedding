import type { Metadata } from "next";
import { PreviewBanner } from "@/components/admin/preview-banner";
import { WeddingSite } from "@/components/site/wedding-site";
import { requireAdmin } from "@/lib/auth/admin";
import { loadSiteData } from "@/lib/site/load";

export const metadata: Metadata = { title: "Preview | Alex & Joanna" };

/**
 * The guest-facing site as an approved admin sees it, whatever the access
 * mode. It sits under /admin, so the admin check applies, and it loads only
 * general content: no guest, no RSVP data, no cookies set.
 */
export default async function AdminPreviewPage() {
  await requireAdmin();
  const data = await loadSiteData({ kind: "admin-preview" });
  return (
    <WeddingSite
      {...data}
      banner={
        <PreviewBanner
          title="Wedding site as guests see it."
          detail={data.settings.accessMode === "private" ? "The site is private, so only invited guests can see this." : "The site is public."}
          exitHref="/admin"
          exitLabel="Exit preview"
        />
      }
    />
  );
}
