import { NextResponse, type NextRequest } from "next/server";
import { logDatabaseError } from "@/lib/db";
import { GUEST_COOKIE } from "@/lib/guest/cookie";
import { exchangeInvitation } from "@/lib/invitations/service";
import { clientKey, RateLimiter } from "@/lib/security/rate-limit";

// Failed attempts per client in a 10-minute window. Valid links are never throttled.
const failedAttempts = new RateLimiter(20, 10 * 60 * 1000);

const INVALID_PATH = "/invitation-not-found";

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * Exchanges /invite/<token> for a guest session cookie, then redirects to the
 * home page so the token doesn't stay in the address bar, history or
 * bookmarks. The token is never logged or echoed. Every failure gets the same
 * response, so the page can't be used to test which tokens exist.
 */
export async function GET(request: NextRequest, context: RouteContext<"/invite/[token]">) {
  const key = clientKey(request.headers);
  if (failedAttempts.isBlocked(key)) {
    return new NextResponse("Too many attempts. Please try again later.", {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": "600" },
    });
  }

  const { token } = await context.params;
  let session: string | null;
  try {
    session = await exchangeInvitation(token);
  } catch (error) {
    logDatabaseError("Invitation exchange failed", error);
    return new NextResponse("Sorry, the site is unavailable right now. Please try your link again shortly.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  if (!session) {
    failedAttempts.hit(key);
    return redirectTo(request, INVALID_PATH);
  }

  const response = redirectTo(request, "/");
  response.cookies.set(GUEST_COOKIE.name, session, GUEST_COOKIE.options);
  return response;
}
