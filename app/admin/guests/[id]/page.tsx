import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { RsvpBadge } from "@/components/admin/badges";
import { InvitationPanel } from "@/components/admin/invitation-panel";
import { RsvpForm } from "@/components/site/rsvp-form";
import { requireAdmin } from "@/lib/auth/admin";
import { listFamilyGroups } from "@/lib/families/service";
import { isUuid } from "@/lib/guests/filters";
import { getGuest } from "@/lib/guests/service";
import { loadMenuForGuests } from "@/lib/menu/service";
import { formatDeadline, isRsvpOpen } from "@/lib/rsvp/deadline";
import { loadRsvp } from "@/lib/rsvp/service";
import { getSiteSettings } from "@/lib/settings/service";
import {
  adminSaveRsvpAction,
  issueInvitationAction,
  setArchivedAction,
  updateGuestAction,
} from "../actions";

export const metadata: Metadata = { title: "Guest | Admin" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

export default async function GuestPage({ params, searchParams }: PageProps<"/admin/guests/[id]">) {
  const email = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const guest = await getGuest(id);
  if (!guest) notFound();

  const [families, settings, rsvp, created] = await Promise.all([
    listFamilyGroups(),
    getSiteSettings(),
    loadRsvp(guest.id, guest.plusOneAllowed),
    searchParams.then((query) => query.created === "1"),
  ]);
  const { questions, categories: menuCategories, optionNames } = await loadMenuForGuests(settings.menuEnabled);
  const archived = guest.archivedAt !== null;
  const fullName = `${guest.firstName} ${guest.lastName}`;
  const open = isRsvpOpen(settings.rsvpDeadline, new Date());

  return (
    <AdminShell
      email={email}
      title={fullName}
      actions={
        <Link href={`/admin/guests/${guest.id}/preview`} className="btn btn-primary">
          Preview as guest
        </Link>
      }
    >
      <p className="-mt-4 mb-6 text-sm">
        <Link href="/admin/guests">← All guests</Link>
      </p>

      {created && (
        <p role="status" className="notice mb-6 text-sm">
          Guest added. Create their invitation link below when you&apos;re ready to send it.
        </p>
      )}
      {archived && (
        <p role="status" className="notice-error mb-6 text-sm">
          This guest is archived. Their invitation link doesn&apos;t work and they aren&apos;t counted.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="details-heading" className="card p-5">
          <h2 id="details-heading" className="mb-4 font-serif text-2xl">
            Details
          </h2>
          <ActionForm action={updateGuestAction.bind(null, guest.id)} label="Guest details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="firstName" label="First name" required defaultValue={guest.firstName} maxLength={100} />
              <Field name="lastName" label="Last name" required defaultValue={guest.lastName} maxLength={100} />
            </div>
            <Field
              name="familyGroupId"
              label="Family group"
              type="select"
              defaultValue={guest.familyGroupId ?? ""}
              options={[
                { value: "", label: "No family group" },
                ...families.map((family) => ({ value: family.id, label: family.name })),
              ]}
            />
            <Checkbox
              name="plusOneAllowed"
              label="Can bring a plus-one"
              hint="Turning this off deletes any plus-one details they've given."
              defaultChecked={guest.plusOneAllowed}
            />
            <div>
              <SubmitButton>Save details</SubmitButton>
            </div>
          </ActionForm>
        </section>

        <section aria-labelledby="invitation-heading" className="card p-5">
          <h2 id="invitation-heading" className="mb-4 font-serif text-2xl">
            Invitation link
          </h2>
          <InvitationPanel
            action={issueInvitationAction.bind(null, guest.id)}
            firstName={guest.firstName}
            hasInvitation={guest.hasInvitation}
            createdAt={guest.invitationCreatedAt ? dateFormat.format(guest.invitationCreatedAt) : null}
            archived={archived}
          />
        </section>

        <section aria-labelledby="rsvp-heading" className="card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="rsvp-heading" className="font-serif text-2xl">
              RSVP
            </h2>
            <p className="text-sm" data-testid="admin-rsvp-status">
              <RsvpBadge attending={rsvp.attending} />
              {rsvp.updatedAt && <span className="text-muted"> · updated {dateFormat.format(rsvp.updatedAt)}</span>}
            </p>
          </div>
          {!open && (
            <p className="notice mb-4 text-sm">
              RSVPs closed{settings.rsvpDeadline ? ` on ${formatDeadline(settings.rsvpDeadline)}` : ""}. Guests
              can&apos;t change their reply, but you still can here.
            </p>
          )}
          <RsvpForm
            mode="admin"
            action={adminSaveRsvpAction.bind(null, guest.id)}
            firstName={guest.firstName}
            plusOneAllowed={guest.plusOneAllowed}
            questions={questions}
            menuCategories={menuCategories}
            optionNames={optionNames}
            ask={{ dietary: settings.askDietary, songRequest: settings.askSongRequest, notes: settings.askNotes }}
            initial={rsvp}
          />
        </section>

        <section aria-labelledby="archive-heading" className="card p-5 lg:col-span-2">
          <h2 id="archive-heading" className="mb-2 font-serif text-2xl">
            {archived ? "Restore guest" : "Archive guest"}
          </h2>
          <p className="mb-4 text-sm text-muted">
            {archived
              ? "Restoring brings the guest back into the counts. Their existing link works again."
              : "Archiving hides the guest from counts and stops their link working. Nothing is deleted, and you can restore them."}
          </p>
          <ActionForm
            action={setArchivedAction.bind(null, guest.id, !archived)}
            label={archived ? "Restore guest" : "Archive guest"}
            confirmMessage={archived ? undefined : `Archive ${fullName}? Their invitation link will stop working.`}
          >
            <div>
              <SubmitButton className={archived ? "btn" : "btn btn-danger"} pendingLabel="Working…">
                {archived ? "Restore guest" : "Archive guest"}
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      </div>
    </AdminShell>
  );
}
