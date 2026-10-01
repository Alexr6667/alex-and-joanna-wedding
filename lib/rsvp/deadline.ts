export const WEDDING_TIME_ZONE = "Europe/London";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in London as YYYY-MM-DD. */
export function londonDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEDDING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidDeadline(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Guests can create or change their RSVP until the end of the deadline day,
 * London time. With no deadline set, RSVPs stay open.
 */
export function isRsvpOpen(deadline: string | null, now: Date): boolean {
  if (!deadline) return true;
  return londonDate(now) <= deadline;
}

/** "1 June 2027" for a YYYY-MM-DD date. */
export function formatDeadline(deadline: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${deadline}T00:00:00Z`));
}
