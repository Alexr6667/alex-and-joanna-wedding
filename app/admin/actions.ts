"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/routes";
import { auth } from "@/lib/auth/server";

export async function signOut() {
  await auth.signOut();
  redirect(ADMIN_LOGIN_PATH);
}
