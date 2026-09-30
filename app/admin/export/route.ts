import { getAdminAccess } from "@/lib/auth/admin";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/routes";
import { logDatabaseError } from "@/lib/db";
import { exportGuestsCsv } from "@/lib/export/service";
import { londonDate } from "@/lib/rsvp/deadline";

/** Downloads every guest and RSVP as CSV. Approved admins only; never includes invitation tokens. */
export async function GET(request: Request) {
  const access = await getAdminAccess();
  if (access.status === "anonymous") return Response.redirect(new URL(ADMIN_LOGIN_PATH, request.url), 303);
  if (access.status !== "admin") return new Response("Forbidden", { status: 403 });

  let csv: string;
  try {
    csv = await exportGuestsCsv();
  } catch (error) {
    logDatabaseError("Guest export failed", error);
    return new Response("Export failed. Please try again.", { status: 500 });
  }

  // A byte-order mark so Excel opens the file as UTF-8.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wedding-guests-${londonDate(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
