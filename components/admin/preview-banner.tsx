import Link from "next/link";

/**
 * Fixed banner on admin previews of the guest site. Previews set no cookies
 * and never create a guest session; they are ordinary admin pages.
 */
export function PreviewBanner({
  title,
  detail,
  exitHref,
  exitLabel,
}: {
  title: string;
  detail: string;
  exitHref: string;
  exitLabel: string;
}) {
  return (
    <div role="region" aria-label="Preview mode" className="border-b border-accent-strong bg-accent-strong text-paper-raised">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-gutter py-2 text-sm">
        {/* min-w-0 lets this flex item shrink below its longest word, so a long unbroken name wraps. */}
        <p className="min-w-0 break-words">
          <strong className="font-semibold">Preview mode: </strong>
          <span data-testid="preview-title">{title}</span>
          <span className="block opacity-90 sm:inline"> {detail}</span>
        </p>
        <Link href={exitHref} className="btn btn-small border-paper-raised text-paper-raised hover:bg-transparent hover:underline">
          {exitLabel}
        </Link>
      </div>
    </div>
  );
}
