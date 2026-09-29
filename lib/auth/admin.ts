import "server-only";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isAllowlistedEmail } from "./admin-allowlist";
import { ADMIN_LOGIN_PATH } from "./routes";
import { auth } from "./server";

export type AdminAccess =
  | { status: "anonymous" }
  | { status: "forbidden" }
  | { status: "admin"; email: string };

export async function getAdminAccess(): Promise<AdminAccess> {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) return { status: "anonymous" };

  // Magic-link sign-in marks the email as verified. Requiring it stops an
  // account created some other way with an admin's address from getting in.
  if (!user.emailVerified || !isAllowlistedEmail(user.email, env.ADMIN_EMAILS)) {
    return { status: "forbidden" };
  }

  return { status: "admin", email: user.email };
}

/**
 * Server-side gate for admin pages. Redirects anonymous visitors to the login
 * page; callers must still handle "forbidden". proxy.ts only does an early
 * redirect and is not the security boundary.
 */
export async function requireSignedIn(): Promise<Exclude<AdminAccess, { status: "anonymous" }>> {
  const access = await getAdminAccess();
  if (access.status === "anonymous") redirect(ADMIN_LOGIN_PATH);
  return access;
}
