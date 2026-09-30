import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { ImportForm } from "@/components/admin/import-form";
import { requireAdmin } from "@/lib/auth/admin";
import { EXPECTED_HEADERS } from "@/lib/import/csv";

export const metadata: Metadata = { title: "Import guests | Admin" };

export default async function ImportPage() {
  const email = await requireAdmin();
  return (
    <AdminShell email={email} title="Import guests">
      <div className="mb-6 max-w-prose text-sm">
        <p>Upload a CSV file whose first row is exactly:</p>
        <pre className="card mt-2 overflow-x-auto p-3 text-xs">{EXPECTED_HEADERS.join(",")}</pre>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>The first row is always treated as headers and never imported.</li>
          <li>first_name and last_name are required.</li>
          <li>family_group is optional. Existing groups are reused; new names create a group.</li>
          <li>plus_one_allowed must be true or false.</li>
          <li>Nothing is saved until you check the preview and confirm.</li>
        </ul>
      </div>
      <ImportForm />
    </AdminShell>
  );
}
