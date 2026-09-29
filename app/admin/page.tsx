import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { requireSignedIn } from "@/lib/auth/admin";
import { checkDatabase } from "@/lib/db";
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

  return (
    <PageShell>
      <h1 className="font-serif text-4xl">Admin</h1>
      <p>
        Signed in as <strong>{access.email}</strong>
      </p>
      <p data-testid="database-status" className="text-muted">
        {database === "ok"
          ? "Database connected and migrations applied."
          : "Database unavailable, or migrations have not been run."}
      </p>
      <SignOutButton />
    </PageShell>
  );
}
