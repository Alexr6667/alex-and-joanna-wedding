import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Checkbox, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { RsvpBadge } from "@/components/admin/badges";
import { requireAdmin } from "@/lib/auth/admin";
import { listFamilyGroups } from "@/lib/families/service";
import { parseGuestFilters } from "@/lib/guests/filters";
import { listGuests } from "@/lib/guests/service";
import { createGuestAction } from "./actions";

export const metadata: Metadata = { title: "Guests | Admin" };

export default async function GuestsPage({ searchParams }: PageProps<"/admin/guests">) {
  const email = await requireAdmin();
  const filters = parseGuestFilters(await searchParams);
  const [guests, families] = await Promise.all([listGuests(filters), listFamilyGroups()]);
  const familyOptions = [
    { value: "", label: "No family group" },
    ...families.map((family) => ({ value: family.id, label: family.name })),
  ];
  const filtered =
    filters.q !== "" ||
    filters.status !== "all" ||
    filters.family !== undefined ||
    filters.archived !== "active" ||
    filters.plusOne !== "any";

  return (
    <AdminShell email={email} title="Guests">
      <details className="card mb-6 p-4">
        <summary className="cursor-pointer font-medium">Add a guest</summary>
        <ActionForm action={createGuestAction} label="Add guest" className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="First name" required maxLength={100} />
          <Field name="lastName" label="Last name" required maxLength={100} />
          <Field name="familyGroupId" label="Family group" type="select" options={familyOptions} />
          <div className="flex items-end pb-2">
            <Checkbox name="plusOneAllowed" label="Can bring a plus-one" />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>Add guest</SubmitButton>
          </div>
        </ActionForm>
      </details>

      <form method="get" role="search" aria-label="Filter guests" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q} className="field-input" />
        </div>
        <FilterSelect
          name="status"
          label="RSVP"
          value={filters.status}
          options={[
            ["all", "All"],
            ["attending", "Attending"],
            ["declined", "Declined"],
            ["awaiting", "Awaiting reply"],
          ]}
        />
        <FilterSelect
          name="family"
          label="Family group"
          value={filters.family ?? ""}
          options={[["", "Any"], ["none", "No group"], ...families.map((f) => [f.id, f.name] as [string, string])]}
        />
        <FilterSelect
          name="plusOne"
          label="Plus-one"
          value={filters.plusOne}
          options={[
            ["any", "Any"],
            ["yes", "Allowed"],
            ["no", "Not allowed"],
          ]}
        />
        <FilterSelect
          name="archived"
          label="Show"
          value={filters.archived}
          options={[
            ["active", "Active guests"],
            ["archived", "Archived guests"],
            ["all", "All guests"],
          ]}
        />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className="btn">
            Apply filters
          </button>
          {filtered && (
            <Link href="/admin/guests" className="btn">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-2 text-sm text-muted" role="status">
        {guests.length} {guests.length === 1 ? "guest" : "guests"}
      </p>

      {guests.length === 0 ? (
        <div className="card p-8 text-center">
          <p>{filtered ? "No guests match these filters." : "No guests yet."}</p>
          {!filtered && (
            <p className="mt-2 text-sm text-muted">
              Add a guest above, or <Link href="/admin/import">import a CSV</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Family group
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  RSVP
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Plus-one
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Link
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {guests.map((guest) => (
                <tr key={guest.id} data-testid="guest-row">
                  <td className="max-w-64 px-4 py-3">
                    <Link href={`/admin/guests/${guest.id}`} className="font-medium break-words">
                      {guest.firstName} {guest.lastName}
                    </Link>
                    {guest.archivedAt && <span className="ml-2 text-xs text-muted">(archived)</span>}
                  </td>
                  <td className="px-4 py-3 break-words text-muted">{guest.familyGroupName ?? "None"}</td>
                  <td className="px-4 py-3">
                    <RsvpBadge attending={guest.attending} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {guest.plusOneAllowed ? (guest.bringingPlusOne ? "Allowed, bringing" : "Allowed") : "No"}
                  </td>
                  <td className="px-4 py-3 text-muted">{guest.hasInvitation ? "Created" : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
}) {
  return (
    <div>
      <label htmlFor={`filter-${name}`} className="field-label">
        {label}
      </label>
      <select id={`filter-${name}`} name={name} defaultValue={value} className="field-input">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
