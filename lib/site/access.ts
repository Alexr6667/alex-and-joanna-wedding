export type SiteAccessMode = "private" | "public";

/**
 * Who is looking at the guest-facing site. Only the server builds these: a
 * guest comes from a valid session cookie, the preview kinds only from an
 * approved admin session on an /admin route.
 */
export type Viewer<Guest = unknown> =
  | { kind: "anonymous" }
  | { kind: "guest"; guest: Guest }
  | { kind: "admin-preview" }
  | { kind: "guest-preview"; guest: Guest };

export type SiteView = "wedding-site" | "invitation-only";

/** Whether the wedding information is shown. RSVP access is decided separately by `canRespond`. */
export function decideSiteView(mode: SiteAccessMode, viewer: Viewer): SiteView {
  if (viewer.kind !== "anonymous") return "wedding-site";
  return mode === "public" ? "wedding-site" : "invitation-only";
}

/** Only a real guest session can submit an RSVP. Previews render the form read-only. */
export function canRespond(viewer: Viewer): boolean {
  return viewer.kind === "guest";
}
