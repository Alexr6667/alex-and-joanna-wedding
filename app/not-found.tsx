import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function NotFound() {
  return (
    <PageShell>
      <h1 className="font-serif text-4xl">Page not found</h1>
      <Link href="/" className="underline">
        Back to the home page
      </Link>
    </PageShell>
  );
}
