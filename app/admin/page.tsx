import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell, PreviewSiteLink } from "@/components/admin/admin-shell";
import { PageShell } from "@/components/page-shell";
import { requireSignedIn } from "@/lib/auth/admin";
import { checkDatabase } from "@/lib/db";
import { getDashboardSummary } from "@/lib/guests/service";
import { formatDeadline, isRsvpOpen } from "@/lib/rsvp/deadline";
import { getSiteSettings } from "@/lib/settings/service";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Admin | Alex & Joanna",
  robots: { index: false, follow: false },
};

function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="rounded border border-ink px-4 py-2">
        Sign out
      </button>
    </form>
  );
}

export default async function AdminPage() {
  const access = await requireSignedIn();

  if (access.status === "forbidden") {
    return (
      <PageShell>
        <h1 className="font-serif text-4xl">Access denied</h1>
        <p className="text-muted">This account is not approved for the admin area.</p>
        <SignOutButton />
      </PageShell>
    );
  }

  const database = await checkDatabase();
  if (database !== "ok") {
    return (
      <AdminShell email={access.email} title="Admin">
        <p data-testid="database-status" role="alert" className="notice-error">
          Database unavailable, or migrations have not been run.
        </p>
      </AdminShell>
    );
  }

  const [summary, settings] = await Promise.all([getDashboardSummary(), getSiteSettings()]);
  const open = isRsvpOpen(settings.rsvpDeadline, new Date());

  return (
    <AdminShell email={access.email} title="Dashboard" actions={<PreviewSiteLink />}>
      <p data-testid="database-status" className="sr-only">
        Database connected and migrations applied.
      </p>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          RSVP summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="summary">
          <Stat label="Invited" value={summary.invited} href="/admin/guests" />
          <Stat label="Attending" value={summary.attending} href="/admin/guests?status=attending" />
          <Stat label="Declined" value={summary.declined} href="/admin/guests?status=declined" />
          <Stat label="Awaiting reply" value={summary.awaiting} href="/admin/guests?status=awaiting" />
          <Stat label="Plus-ones coming" value={summary.plusOnes} />
          <Stat label="Total coming" value={summary.attending + summary.plusOnes} />
        </dl>
        {summary.archived > 0 && (
          <p className="mt-2 text-sm text-muted">
            {summary.archived} archived {summary.archived === 1 ? "guest is" : "guests are"} not counted.
          </p>
        )}
      </section>

      <section aria-labelledby="status-heading" className="mt-10 grid gap-4 sm:grid-cols-2">
        <h2 id="status-heading" className="sr-only">
          Site status
        </h2>
        <div className="card p-5">
          <p className="eyebrow">RSVP deadline</p>
          <p className="mt-2 font-serif text-2xl" data-testid="deadline">
            {settings.rsvpDeadline ? formatDeadline(settings.rsvpDeadline) : "Not set"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {open ? "Guests can reply and change their reply." : "Closed. Guests can view but not change replies."}
          </p>
        </div>
        <div className="card p-5">
          <p className="eyebrow">Site access</p>
          <p className="mt-2 font-serif text-2xl" data-testid="access-mode">
            {settings.accessMode === "private" ? "Private" : "Public"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {settings.accessMode === "private"
              ? "Only guests with an invitation link can see the wedding details."
              : "Anyone can see the wedding details. Replying still needs an invitation link."}
          </p>
          <Link href="/admin/settings" className="mt-3 inline-block text-sm">
            Change settings
          </Link>
        </div>
      </section>
    </AdminShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-4xl">
        {href ? (
          <Link href={href} className="no-underline hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
