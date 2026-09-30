import { CornerLeaves, LeafDivider } from "@/components/decor/sprig";

/**
 * Shown to visitors without an invitation while the site is private, and for
 * links that don't work. Says nothing about the wedding, not even whose it is,
 * or about which guests exist.
 */
export function InvitationOnly({
  heading = "Private wedding website",
  message = "This website is for invited guests. Please use the personal link from your invitation to view it.",
  role,
}: {
  heading?: string;
  message?: string;
  role?: "alert";
}) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-gutter py-16">
      <CornerLeaves className="pointer-events-none absolute top-0 left-0 h-32 w-32 text-accent opacity-60" />
      <CornerLeaves className="pointer-events-none absolute right-0 bottom-0 h-32 w-32 -scale-100 text-accent opacity-60" />
      <div className="card relative flex w-full max-w-md flex-col items-center gap-5 px-6 py-12 text-center sm:px-10">
        <h1 className="font-serif text-4xl sm:text-5xl">{heading}</h1>
        <LeafDivider />
        <p role={role} className="text-muted">
          {message}
        </p>
      </div>
    </main>
  );
}
