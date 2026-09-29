import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "RSVP | Alex & Joanna",
  robots: { index: false, follow: false },
};

// Placeholder shape check only. The real token model arrives with the RSVP feature.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export default async function RsvpPage({ params }: PageProps<"/rsvp/[token]">) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();

  // The token is deliberately not echoed back into the page.
  return (
    <PageShell>
      <h1 className="font-serif text-4xl">RSVP</h1>
      <p className="text-muted">RSVPs are not open yet. Please check back closer to the day.</p>
    </PageShell>
  );
}
