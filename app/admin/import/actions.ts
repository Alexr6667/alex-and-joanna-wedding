"use server";

import { AdminAuthorizationError, assertAdmin } from "@/lib/auth/admin";
import { logDatabaseError } from "@/lib/db";
import { isUuid } from "@/lib/guests/filters";
import { MAX_IMPORT_BYTES } from "@/lib/import/csv";
import {
  commitImport,
  PREVIEW_REQUIRED_ERROR,
  previewImport,
  type ImportPreview,
  type ImportResult,
} from "@/lib/import/service";

async function readUpload(formData: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file to upload." };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: "That file is too large. The limit is 256 KB." };
  const text = await file.text();
  if (text.includes("\u0000")) return { ok: false, error: "That doesn't look like a CSV text file." };
  return { ok: true, text };
}

async function adminOnly<T extends { ok: boolean }>(
  run: (adminEmail: string) => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  let email: string;
  try {
    email = await assertAdmin();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, error: "Your admin session has ended. Please sign in again." };
    }
    throw error;
  }
  try {
    return await run(email);
  } catch (error) {
    logDatabaseError("Guest import failed", error);
    return { ok: false, error: "Something went wrong and nothing was imported. Please try again." };
  }
}

/** Step 1: parse and check the file. Writes no guests; records the check for step 2. */
export async function previewImportAction(formData: FormData): Promise<ImportPreview> {
  return adminOnly(async (adminEmail) => {
    const upload = await readUpload(formData);
    if (!upload.ok) return upload;
    return previewImport(upload.text, adminEmail);
  });
}

/**
 * Step 2: import the same file after the admin has reviewed the preview. The
 * server looks up its own record of the check; the browser only says which one.
 */
export async function commitImportAction(formData: FormData): Promise<ImportResult> {
  return adminOnly(async (adminEmail) => {
    if (formData.get("confirm") !== "yes") return { ok: false, error: "Please confirm the import." };
    const previewId = formData.get("previewId");
    if (typeof previewId !== "string" || !isUuid(previewId)) return { ok: false, error: PREVIEW_REQUIRED_ERROR };
    const upload = await readUpload(formData);
    if (!upload.ok) return upload;
    return commitImport(upload.text, previewId, adminEmail, formData.get("acknowledgeDuplicates") === "yes");
  });
}
