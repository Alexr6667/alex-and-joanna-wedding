import "server-only";
import { unstable_rethrow } from "next/navigation";
import { logDatabaseError } from "@/lib/db";
import { formError, type FormState } from "@/lib/forms";
import { AdminAuthorizationError, assertAdmin } from "./admin";

/**
 * Runs an admin form action. Checks the admin session first (Server Actions
 * can be called directly, so the page's own check is not enough), and turns
 * unexpected failures into a readable message without exposing details.
 */
export async function runAdminAction(run: (adminEmail: string) => Promise<FormState>): Promise<FormState> {
  let email: string;
  try {
    email = await assertAdmin();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return formError("Your admin session has ended. Please sign in again.");
    }
    throw error;
  }

  try {
    return await run(email);
  } catch (error) {
    unstable_rethrow(error);
    logDatabaseError("Admin action failed", error);
    return formError("Something went wrong and nothing was saved. Please try again.");
  }
}
