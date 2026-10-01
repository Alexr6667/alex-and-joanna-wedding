"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { commitImportAction, previewImportAction } from "@/app/admin/import/actions";
import type { ImportPreview, ImportResult } from "@/lib/import/service";

/**
 * Two-step import. The chosen file stays in the browser between steps and is
 * sent again on confirm with the id of the server's preview record. The
 * server imports only if that record belongs to this admin and matches the
 * file exactly. It also re-checks for duplicates and refuses them unless the
 * acknowledgement box was ticked for the duplicates the preview showed.
 */
export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  function onFileChange(next: File | null) {
    setFile(next);
    setPreview(null);
    setResult(null);
    setAcknowledged(false);
  }

  function check() {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      setResult(null);
      setPreview(await previewImportAction(formData));
    });
  }

  function commit() {
    if (!file || !preview?.ok || !preview.previewId) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("previewId", preview.previewId);
    formData.set("confirm", "yes");
    if (acknowledged) formData.set("acknowledgeDuplicates", "yes");
    startTransition(async () => {
      const outcome = await commitImportAction(formData);
      setResult(outcome);
      if (outcome.ok) setPreview(null);
    });
  }

  const blocked =
    !preview?.ok ||
    !preview.previewId ||
    preview.invalid.length > 0 ||
    preview.alreadyImportedAt !== null ||
    preview.rows.length === 0;
  const needsAck = preview?.ok && preview.duplicates.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="csv-file" className="field-label">
            CSV file
          </label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            className="field-input"
            onChange={(event) => onFileChange(event.currentTarget.files?.[0] ?? null)}
          />
        </div>
        <button type="button" className="btn" onClick={check} disabled={!file || pending}>
          {pending && !preview ? "Checking…" : "Check file"}
        </button>
      </div>

      {result?.ok && (
        <div role="status" className="notice">
          <p>
            Imported {result.imported} {result.imported === 1 ? "guest" : "guests"}.
          </p>
          <p className="mt-1 text-sm">
            <Link href="/admin/guests">Go to the guest list</Link> to create their invitation links.
          </p>
        </div>
      )}
      {result && !result.ok && (
        <p role="alert" className="notice-error">
          {result.error}
        </p>
      )}

      {preview && !preview.ok && (
        <p role="alert" className="notice-error" data-testid="import-error">
          {preview.error}
        </p>
      )}

      {preview?.ok && (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-4" data-testid="import-preview">
          <h2 id="preview-heading" className="font-serif text-2xl">
            Preview
          </h2>
          <p>
            {preview.rows.length} valid {preview.rows.length === 1 ? "row" : "rows"}
            {preview.invalid.length > 0 && `, ${preview.invalid.length} invalid`}.
            {preview.newFamilyGroups.length > 0 && ` New family groups: ${preview.newFamilyGroups.join(", ")}.`}
            {preview.existingFamilyGroups.length > 0 &&
              ` Existing groups reused: ${preview.existingFamilyGroups.join(", ")}.`}
          </p>

          {preview.alreadyImportedAt && (
            <p role="alert" className="notice-error">
              This exact file was already imported on{" "}
              {new Date(preview.alreadyImportedAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}. It
              won&apos;t be imported again.
            </p>
          )}

          {preview.invalid.length > 0 && (
            <div role="alert" className="notice-error" data-testid="invalid-rows">
              <p className="font-medium">
                Fix these rows and upload the file again. Nothing will be imported until every row is valid.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.invalid.map((row) => (
                  <li key={row.line}>
                    Line {row.line}: {row.problems.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.duplicates.length > 0 && (
            <div className="notice" data-testid="duplicate-warnings">
              <p className="font-medium">Possible duplicates. These will be added as separate guests, not merged.</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {preview.duplicates.map((warning) => (
                  <li key={warning.line}>
                    Line {warning.line}, {warning.name}:{" "}
                    {[
                      warning.sameFileLines.length > 0 && `also on line ${warning.sameFileLines.join(", ")}`,
                      warning.existingGuests > 0 &&
                        `${warning.existingGuests} existing ${warning.existingGuests === 1 ? "guest has" : "guests have"} this name`,
                    ]
                      .filter(Boolean)
                      .join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.rows.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Guests to import</caption>
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Line</th>
                    <th scope="col" className="px-3 py-2 font-medium">First name</th>
                    <th scope="col" className="px-3 py-2 font-medium">Last name</th>
                    <th scope="col" className="px-3 py-2 font-medium">Family group</th>
                    <th scope="col" className="px-3 py-2 font-medium">Plus-one</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.rows.map((row) => (
                    <tr key={row.line}>
                      <td className="px-3 py-2 text-muted">{row.line}</td>
                      <td className="px-3 py-2 break-words">{row.firstName}</td>
                      <td className="px-3 py-2 break-words">{row.lastName}</td>
                      <td className="px-3 py-2 break-words">{row.familyGroup ?? "None"}</td>
                      <td className="px-3 py-2">{row.plusOneAllowed ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!blocked && (
            <div className="card flex flex-col gap-3 p-5">
              {needsAck && (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.currentTarget.checked)}
                  />
                  I&apos;ve checked the possible duplicates and want to add them as separate guests.
                </label>
              )}
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={commit}
                  disabled={pending || (needsAck && !acknowledged)}
                >
                  {pending ? "Importing…" : `Import ${preview.rows.length} ${preview.rows.length === 1 ? "guest" : "guests"}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
