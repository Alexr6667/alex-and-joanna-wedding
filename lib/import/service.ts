import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { familyGroups, guestImportPreviews, guestImports, guests } from "@/lib/db/schema";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/families/service";
import {
  findDuplicates,
  parseGuestCsv,
  planFamilyGroups,
  unacknowledgedDuplicateLines,
  type DuplicateWarning,
  type ImportRow,
  type InvalidRow,
} from "./csv";

export function fileHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** How long a checked file can wait for the admin to confirm it. */
const PREVIEW_LIFETIME = sql`interval '30 minutes'`;

/**
 * Every import takes this transaction-level advisory lock before it reads the
 * guest list, so two imports can't both check for duplicates before either
 * has inserted its guests. Postgres releases it at commit or rollback. It is
 * the only lock taken before the import's other statements, and nothing else
 * takes it, so it can't form a deadlock cycle. Works through Neon's pooler,
 * which keeps a transaction on one connection.
 */
const IMPORT_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('guest_import', 0))`;

export const PREVIEW_REQUIRED_ERROR =
  "This file hasn't been checked, or it changed after it was checked. Check it again before importing.";

export type ImportPreview =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Server-side record of this check, needed to confirm. Null when the file can't be imported. */
      previewId: string | null;
      rows: ImportRow[];
      invalid: InvalidRow[];
      duplicates: DuplicateWarning[];
      newFamilyGroups: string[];
      existingFamilyGroups: string[];
      /** Set if this exact file was imported before. Importing is blocked. */
      alreadyImportedAt: Date | null;
    };

/**
 * Parses and checks a file. Writes no guests, family groups or import
 * records. If the file could be imported, it records the check (admin, file
 * hash, flagged duplicate lines) so the admin can confirm it.
 */
export async function previewImport(text: string, adminEmail: string): Promise<ImportPreview> {
  const parsed = parseGuestCsv(text);
  if (!parsed.ok) return parsed;

  const sha = fileHash(text);
  const [existingGuests, groups, [previous]] = await Promise.all([
    db.select({ firstName: guests.firstName, lastName: guests.lastName }).from(guests),
    db.select({ id: familyGroups.id, name: familyGroups.name }).from(familyGroups),
    db.select({ createdAt: guestImports.createdAt }).from(guestImports).where(eq(guestImports.fileSha256, sha)),
  ]);

  const plan = planFamilyGroups(parsed.rows, groups);
  const usedExisting = new Set<string>();
  for (const row of parsed.rows) {
    const resolved = plan.resolve(row.familyGroup);
    if (resolved && "existingId" in resolved) {
      usedExisting.add(groups.find((group) => group.id === resolved.existingId)!.name);
    }
  }
  const duplicates = findDuplicates(parsed.rows, existingGuests);

  let previewId: string | null = null;
  if (parsed.invalid.length === 0 && parsed.rows.length > 0 && !previous) {
    await db.delete(guestImportPreviews).where(lt(guestImportPreviews.expiresAt, sql`now()`));
    const [row] = await db
      .insert(guestImportPreviews)
      .values({
        adminEmail: adminEmail.toLowerCase(),
        fileSha256: sha,
        duplicateLines: duplicates.map((warning) => warning.line),
        expiresAt: sql`now() + ${PREVIEW_LIFETIME}`,
      })
      .returning({ id: guestImportPreviews.id });
    previewId = row.id;
  }

  return {
    ok: true,
    previewId,
    rows: parsed.rows,
    invalid: parsed.invalid,
    duplicates,
    newFamilyGroups: plan.create,
    existingFamilyGroups: [...usedExisting].sort(),
    alreadyImportedAt: previous?.createdAt ?? null,
  };
}

export type ImportResult = { ok: true; imported: number } | { ok: false; error: string };

/**
 * Imports a checked file in one transaction, holding the import lock.
 *
 * The preview record must belong to this admin, match the uploaded file's
 * hash and not have expired. It is deleted in the same transaction, so a
 * successful import uses it up, and a failed one (rolled back) leaves it for
 * a retry.
 *
 * Possible duplicates are worked out again under the lock rather than trusted
 * from the preview. The import stops unless the admin acknowledged them, and
 * an acknowledgement covers only the lines the preview showed.
 */
export async function commitImport(
  text: string,
  previewId: string,
  adminEmail: string,
  duplicatesAcknowledged: boolean,
): Promise<ImportResult> {
  const sha = fileHash(text);
  const parsed = parseGuestCsv(text);
  if (!parsed.ok) return parsed;
  if (parsed.invalid.length > 0) {
    return { ok: false, error: "Fix the invalid rows and upload the file again. Nothing was imported." };
  }

  let outcome: ImportResult;
  try {
    outcome = await db.transaction(async (tx): Promise<ImportResult> => {
      // Fail rather than queue indefinitely behind a stuck import.
      await tx.execute(sql`set local lock_timeout = '15s'`);
      await tx.execute(IMPORT_LOCK);

      const [preview] = await tx
        .delete(guestImportPreviews)
        .where(
          and(
            eq(guestImportPreviews.id, previewId),
            eq(guestImportPreviews.adminEmail, adminEmail.toLowerCase()),
            eq(guestImportPreviews.fileSha256, sha),
            gt(guestImportPreviews.expiresAt, sql`now()`),
          ),
        )
        .returning({ duplicateLines: guestImportPreviews.duplicateLines });
      if (!preview) return { ok: false, error: PREVIEW_REQUIRED_ERROR };

      const [previous] = await tx
        .select({ id: guestImports.id })
        .from(guestImports)
        .where(eq(guestImports.fileSha256, sha));
      if (previous) {
        return { ok: false, error: "This file has already been imported. Nothing was imported again." };
      }

      const existingGuests = await tx.select({ firstName: guests.firstName, lastName: guests.lastName }).from(guests);
      const duplicates = findDuplicates(parsed.rows, existingGuests);
      if (duplicates.length > 0 && !duplicatesAcknowledged) {
        return {
          ok: false,
          error: "This file has possible duplicates. Check the file again and confirm them before importing.",
        };
      }
      if (unacknowledgedDuplicateLines(duplicates, preview.duplicateLines).length > 0) {
        return {
          ok: false,
          error:
            "New possible duplicates appeared after the file was checked. Check the file again and confirm them before importing.",
        };
      }

      await tx.insert(guestImports).values({ fileSha256: sha, rowCount: parsed.rows.length });

      const groups = await tx.select({ id: familyGroups.id, name: familyGroups.name }).from(familyGroups);
      const plan = planFamilyGroups(parsed.rows, groups);
      const created = plan.create.length
        ? await tx
            .insert(familyGroups)
            .values(plan.create.map((name) => ({ name })))
            .returning({ id: familyGroups.id, name: familyGroups.name })
        : [];
      const createdByKey = new Map(created.map((group) => [group.name.toLowerCase(), group.id]));

      await tx.insert(guests).values(
        parsed.rows.map((row) => {
          const resolved = plan.resolve(row.familyGroup);
          const familyGroupId = !resolved
            ? null
            : "existingId" in resolved
              ? resolved.existingId
              : createdByKey.get(resolved.newName.toLowerCase())!;
          return {
            firstName: row.firstName,
            lastName: row.lastName,
            familyGroupId,
            plusOneAllowed: row.plusOneAllowed,
          };
        }),
      );
      return { ok: true, imported: parsed.rows.length };
    });
  } catch (error) {
    // Imports are serialised, so this is a change made outside an import at
    // the same moment, such as an admin adding a family group of the same name,
    // or deleting an existing group this file uses (its guests' foreign key
    // check waits for the delete, then fails).
    if (isUniqueViolation(error) || isForeignKeyViolation(error)) {
      return { ok: false, error: "The guest list changed during the import, so nothing was imported. Please try again." };
    }
    throw error;
  }

  return outcome;
}
