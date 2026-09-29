"use client";

import { PageShell } from "@/components/page-shell";

// Never render error.message here: in development it can contain internals, and
// Next.js already replaces it with a generic digest in production.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageShell>
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <button type="button" onClick={reset} className="rounded border border-ink px-4 py-2">
        Try again
      </button>
    </PageShell>
  );
}
