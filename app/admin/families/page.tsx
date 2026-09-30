import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { listFamilyGroups } from "@/lib/families/service";
import { listGuests } from "@/lib/guests/service";
import {
  createFamilyGroupAction,
  deleteFamilyGroupAction,
  removeFromFamilyGroupAction,
  renameFamilyGroupAction,
} from "./actions";

export const metadata: Metadata = { title: "Family groups | Admin" };

export default async function FamiliesPage() {
  const email = await requireAdmin();
  const [groups, guests] = await Promise.all([
    listFamilyGroups(),
    listGuests({ q: "", status: "all", archived: "all", plusOne: "any", family: undefined }),
  ]);

  return (
    <AdminShell email={email} title="Family groups">
      <p className="mb-6 max-w-prose text-sm text-muted">
        Groups are only for keeping the guest list tidy. Every guest still has their own invitation link and RSVP.
        To move a guest into a group, edit the guest.
      </p>

      <section aria-labelledby="new-group" className="card mb-8 p-5">
        <h2 id="new-group" className="mb-4 font-serif text-2xl">
          New family group
        </h2>
        <ActionForm action={createFamilyGroupAction} resetOnSuccess label="New family group" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field name="name" label="Name" required maxLength={120} className="flex-1" />
          <SubmitButton>Create group</SubmitButton>
        </ActionForm>
      </section>

      {groups.length === 0 ? (
        <p className="card p-8 text-center">No family groups yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((group) => {
            const members = guests.filter((guest) => guest.familyGroupId === group.id);
            return (
              <li key={group.id} className="card p-5" data-testid="family-group">
                <ActionForm
                  action={renameFamilyGroupAction.bind(null, group.id)}
                  label={`Rename ${group.name}`}
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                >
                  <Field name="name" label="Group name" defaultValue={group.name} required maxLength={120} className="flex-1" />
                  <SubmitButton className="btn">Rename</SubmitButton>
                </ActionForm>

                <h3 className="mt-4 text-sm font-medium">
                  {members.length} {members.length === 1 ? "guest" : "guests"}
                </h3>
                {members.length > 0 && (
                  <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                    {members.map((guest) => (
                      <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="break-words">
                          <Link href={`/admin/guests/${guest.id}`}>
                            {guest.firstName} {guest.lastName}
                          </Link>
                          {guest.archivedAt && <span className="text-muted"> (archived)</span>}
                        </span>
                        <ActionForm
                          action={removeFromFamilyGroupAction.bind(null, guest.id)}
                          label={`Remove ${guest.firstName} ${guest.lastName} from ${group.name}`}
                          className="flex items-center gap-2"
                        >
                          <SubmitButton className="btn btn-small" pendingLabel="Removing…">
                            Remove from group
                          </SubmitButton>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                )}
                {members.length === 0 && (
                  <ActionForm
                    action={deleteFamilyGroupAction.bind(null, group.id)}
                    label={`Delete ${group.name}`}
                    confirmMessage={`Delete the empty group "${group.name}"?`}
                    className="mt-3 flex flex-col gap-2"
                  >
                    <div>
                      <SubmitButton className="btn btn-small btn-danger" pendingLabel="Deleting…">
                        Delete empty group
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
