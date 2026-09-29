import { isAllowlistedEmail, normalizeEmail } from "./admin-allowlist";
import { ADMIN_CALLBACK_PATH, ADMIN_LINK_ERROR_PATH } from "./routes";

export type MagicLinkDecision =
  | { action: "forward"; body: { email: string; callbackURL: string; errorCallbackURL: string } }
  | { action: "ignore" }
  | { action: "reject" };

/**
 * Decides what to do with a magic-link request before it reaches Neon Auth.
 *
 * Unapproved addresses are ignored rather than rejected so the response is
 * identical either way and the login form cannot be used to discover who the
 * admins are. Redirect targets are fixed server-side so a crafted request
 * cannot point the emailed link somewhere else.
 */
export function decideMagicLinkRequest(
  body: unknown,
  allowlist: readonly string[],
): MagicLinkDecision {
  if (typeof body !== "object" || body === null) return { action: "reject" };

  const { email } = body as { email?: unknown };
  if (typeof email !== "string" || email.trim() === "") return { action: "reject" };

  if (!isAllowlistedEmail(email, allowlist)) return { action: "ignore" };

  return {
    action: "forward",
    body: {
      email: normalizeEmail(email),
      callbackURL: ADMIN_CALLBACK_PATH,
      errorCallbackURL: ADMIN_LINK_ERROR_PATH,
    },
  };
}
