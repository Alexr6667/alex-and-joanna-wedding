/**
 * Placeholder botanical line drawings, drawn in currentColor so they take the
 * accent token. Swap these components for final artwork later; nothing else
 * depends on their shapes.
 */
export function Sprig({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M6 40 C 34 34, 70 22, 114 8" />
      <path d="M26 35 C 22 27, 26 20, 33 17 C 35 25, 32 31, 26 35 Z" />
      <path d="M26 35 C 30 41, 38 43, 45 40 C 40 34, 33 33, 26 35 Z" />
      <path d="M52 27 C 49 19, 53 12, 60 10 C 62 18, 59 24, 52 27 Z" />
      <path d="M52 27 C 57 33, 65 34, 71 31 C 66 25, 59 25, 52 27 Z" />
      <path d="M79 19 C 77 12, 81 6, 87 4 C 89 11, 86 16, 79 19 Z" />
      <path d="M79 19 C 84 24, 91 25, 97 22 C 92 17, 85 17, 79 19 Z" />
      <circle cx="112" cy="9" r="2" />
    </svg>
  );
}

/** A thin rule with a small leaf pair in the middle, used between sections. */
export function LeafDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-4 text-accent ${className}`} aria-hidden="true">
      <span className="h-px w-16 bg-line-strong sm:w-24" />
      <svg viewBox="0 0 40 20" fill="none" stroke="currentColor" strokeWidth="1.1" className="h-4 w-8">
        <path d="M20 17 C 12 16, 6 11, 4 4 C 12 5, 18 10, 20 17 Z" />
        <path d="M20 17 C 28 16, 34 11, 36 4 C 28 5, 22 10, 20 17 Z" />
      </svg>
      <span className="h-px w-16 bg-line-strong sm:w-24" />
    </div>
  );
}

/** Corner flourish for the hero and photo frame. */
export function CornerLeaves({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M4 76 C 10 50, 28 26, 72 6" />
      <path d="M18 52 C 12 44, 14 36, 22 32 C 26 40, 24 47, 18 52 Z" />
      <path d="M18 52 C 26 56, 34 54, 38 48 C 31 44, 24 46, 18 52 Z" />
      <path d="M38 30 C 35 22, 39 15, 47 13 C 49 21, 45 27, 38 30 Z" />
      <path d="M38 30 C 45 34, 53 32, 57 26 C 50 22, 43 24, 38 30 Z" />
    </svg>
  );
}
