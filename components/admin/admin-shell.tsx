import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/admin/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/guests", label: "Guests" },
  { href: "/admin/families", label: "Family groups" },
  { href: "/admin/import", label: "Import CSV" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminShell({
  email,
  title,
  actions,
  children,
}: {
  email: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-paper-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-gutter py-3">
          <Link href="/admin" className="font-serif text-xl no-underline">
            A &amp; J · Admin
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">
              Signed in as <strong className="font-medium text-ink">{email}</strong>
            </span>
            <form action={signOut}>
              <button type="submit" className="btn btn-small">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-6xl overflow-x-auto px-gutter">
          <ul className="flex gap-5 text-sm whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-block py-2 text-muted no-underline hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a href="/admin/export" className="inline-block py-2 text-muted no-underline hover:text-ink">
                Export CSV
              </a>
            </li>
          </ul>
        </nav>
      </header>
      {/* Names can be up to 100 characters with no spaces. Let any word break so they never widen the page. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-gutter py-8 wrap-anywhere">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-serif text-4xl">{title}</h1>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Opens the general admin preview of the guest-facing site in a new tab. */
export function PreviewSiteLink() {
  return (
    <a href="/admin/preview" target="_blank" rel="noopener" className="btn btn-primary">
      Preview wedding site
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
