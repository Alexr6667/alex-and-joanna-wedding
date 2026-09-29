import { ADMIN_LOGIN_PATH } from "@/lib/auth/routes";
import { auth } from "@/lib/auth/server";

// Early redirect for signed-out visitors, plus Neon Auth session refresh and
// the post-sign-in token exchange. The admin pages repeat the full check
// (session + allowlist) on the server, so this is not the security boundary.
export default auth.middleware({ loginUrl: ADMIN_LOGIN_PATH });

export const config = {
  matcher: ["/admin/:path*"],
};
