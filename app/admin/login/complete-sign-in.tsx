"use client";

import { useEffect, useRef } from "react";
import { authClient } from "@/lib/auth/client";
import { ADMIN_CALLBACK_PATH, ADMIN_LINK_ERROR_PATH } from "@/lib/auth/routes";

/**
 * Finishes a magic-link sign-in. Neon Auth verifies the emailed link on its own
 * domain, then redirects back with a one-time `neon_auth_session_verifier`.
 * proxy.ts only exchanges that verifier for OAuth sign-ins (it needs a challenge
 * cookie that magic-link sign-in never sets), so it sends the visitor here with
 * the verifier still in the URL. `getSession()` in the browser forwards it
 * through /api/auth, which stores the session cookies. /admin then applies the
 * usual server-side checks, so this component grants nothing by itself.
 */
export function CompleteSignIn() {
  const started = useRef(false);

  useEffect(() => {
    // Run once: the verifier is single-use, and dev mode runs effects twice.
    if (started.current) return;
    started.current = true;

    authClient
      .getSession()
      .then(({ data }) => {
        window.location.replace(data?.session ? ADMIN_CALLBACK_PATH : ADMIN_LINK_ERROR_PATH);
      })
      .catch(() => window.location.replace(ADMIN_LINK_ERROR_PATH));
  }, []);

  return (
    <p role="status" className="max-w-sm">
      Signing you in…
    </p>
  );
}
