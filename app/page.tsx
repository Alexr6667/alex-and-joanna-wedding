import { PageShell } from "@/components/page-shell";

export default function HomePage() {
  return (
    <PageShell>
      <h1 className="font-serif text-5xl sm:text-6xl">Alex &amp; Joanna</h1>
      <p className="font-serif text-xl sm:text-2xl">
        <time dateTime="2027-08-28">28 August 2027</time>
      </p>
      <p className="text-muted">Wedding website coming soon</p>
    </PageShell>
  );
}
