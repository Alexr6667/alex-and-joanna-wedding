/** Guest sessions last a year, well past the wedding, and below Chrome's 400-day cookie cap. */
export const GUEST_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Cookie name and flags for the guest session. In production the `__Host-`
 * prefix makes browsers insist on Secure, Path=/ and no Domain, so the cookie
 * is scoped to this exact host. SameSite=Lax keeps it on ordinary navigation
 * (such as following a link from WhatsApp) but off cross-site POSTs.
 */
export function guestCookie(secure: boolean) {
  return {
    name: secure ? "__Host-wedding_guest" : "wedding_guest",
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
    },
  };
}

export const GUEST_COOKIE = guestCookie(process.env.NODE_ENV === "production");
