import "server-only";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isAllowlistedEmail } from "./admin-allowlist";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "./routes";
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

/**
 * Gate for every admin page other than /admin itself. Anonymous visitors go to
 * the login page; signed-in users who are not approved go to /admin, which
 * shows "Access denied". Returns the admin's email.
 */
export async function requireAdmin(): Promise<string> {
  const access = await getAdminAccess();
  if (access.status === "anonymous") redirect(ADMIN_LOGIN_PATH);
  if (access.status === "forbidden") redirect(ADMIN_HOME_PATH);
  return access.email;
}

export class AdminAuthorizationError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminAuthorizationError";
  }
}

/**
 * Gate for admin Server Actions and route handlers, which can be called
 * directly without going through a page. Throws unless the caller is an
 * approved admin.
 */
export async function assertAdmin(): Promise<string> {
  const access = await getAdminAccess();
  if (access.status !== "admin") throw new AdminAuthorizationError();
  return access.email;
}
