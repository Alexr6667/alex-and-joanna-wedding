/** RSVP status as text plus a symbol, so the state never depends on colour alone. */
export function RsvpBadge({ attending }: { attending: boolean | null }) {
  if (attending === null) {
    return <span className="inline-flex items-center gap-1 text-muted">○ Awaiting reply</span>;
  }
  return attending ? (
    <span className="inline-flex items-center gap-1 text-accent-strong">✓ Attending</span>
  ) : (
    <span className="inline-flex items-center gap-1">✕ Declined</span>
  );
}
