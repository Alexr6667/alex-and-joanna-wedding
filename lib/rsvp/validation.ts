import type { MenuQuestion, Selections } from "@/lib/menu/logic";

export const TEXT_LIMITS = {
  name: 120,
  dietary: 500,
  songRequest: 200,
  notes: 1000,
} as const;

export type RsvpFormContext = {
  plusOneAllowed: boolean;
  /** Menu questions currently shown to guests. Empty when menu choices are off. */
  questions: readonly MenuQuestion[];
  ask: { dietary: boolean; songRequest: boolean; notes: boolean };
  /** Guests must answer every menu question. Admins may leave them blank. */
  requireChoices: boolean;
};

export type AttendeeInput = {
  /** Undefined when the question is not asked, so the stored value is kept. */
  dietaryRequirements?: string | null;
  /** Only categories currently asked. Others keep their stored value. */
  selections: Selections;
};

export type RsvpSubmission = {
  attending: boolean;
  notes?: string | null;
  /** Present only when attending. Declining keeps earlier choices in case the guest changes back. */
  attendingDetails?: {
    songRequest?: string | null;
    guest: AttendeeInput;
    /**
     * undefined: plus-ones not allowed, nothing to change.
     * null: not bringing anyone, so any stored plus-one is removed.
     */
    plusOne?: (AttendeeInput & { fullName: string }) | null;
  };
};

export type RsvpValidationResult =
  | { ok: true; value: RsvpSubmission }
  | { ok: false; errors: Record<string, string> };

type Read = (name: string) => string | null;

export const choiceField = (prefix: "choice" | "plusOneChoice", key: string) => `${prefix}.${key}`;

/**
 * Validates an RSVP form on the server. Field visibility in the browser is a
 * convenience only: everything the guest may not answer is ignored or rejected
 * here, whatever the request contains.
 */
export function validateRsvp(read: Read, context: RsvpFormContext): RsvpValidationResult {
  const errors: Record<string, string> = {};

  const text = (name: string, max: number, label: string): string | null => {
    const value = (read(name) ?? "").trim();
    if (value.length > max) errors[name] = `${label} must be ${max} characters or fewer.`;
    return value === "" ? null : value;
  };

  const attendingRaw = read("attending");
  if (attendingRaw !== "yes" && attendingRaw !== "no") {
    return { ok: false, errors: { attending: "Please let us know whether you can come." } };
  }
  const attending = attendingRaw === "yes";

  const value: RsvpSubmission = { attending };
  if (context.ask.notes) value.notes = text("notes", TEXT_LIMITS.notes, "Notes");

  if (attending) {
    const guest = readAttendee(read, context, "choice", "dietary", errors, text);
    const details: NonNullable<RsvpSubmission["attendingDetails"]> = { guest };
    if (context.ask.songRequest) {
      details.songRequest = text("songRequest", TEXT_LIMITS.songRequest, "Song request");
    }

    const bringing = read("bringingPlusOne");
    if (context.plusOneAllowed) {
      if (bringing !== "yes" && bringing !== "no") {
        errors.bringingPlusOne = "Please let us know whether you'll bring a guest.";
      } else if (bringing === "yes") {
        const fullName = text("plusOneName", TEXT_LIMITS.name, "Your guest's name");
        if (!fullName) errors.plusOneName = "Please tell us your guest's name.";
        const plusOne = readAttendee(read, context, "plusOneChoice", "plusOneDietary", errors, text);
        details.plusOne = { ...plusOne, fullName: fullName ?? "" };
      } else {
        details.plusOne = null;
      }
    } else if (bringing === "yes") {
      errors.bringingPlusOne = "This invitation doesn't include a plus-one.";
    }

    value.attendingDetails = details;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

function readAttendee(
  read: Read,
  context: RsvpFormContext,
  prefix: "choice" | "plusOneChoice",
  dietaryField: string,
  errors: Record<string, string>,
  text: (name: string, max: number, label: string) => string | null,
): AttendeeInput {
  const attendee: AttendeeInput = { selections: {} };
  if (context.ask.dietary) {
    attendee.dietaryRequirements = text(dietaryField, TEXT_LIMITS.dietary, "Dietary requirements");
  }

  for (const question of context.questions) {
    const field = choiceField(prefix, question.key);
    const chosen = (read(field) ?? "").trim();
    if (chosen === "") {
      if (context.requireChoices) errors[field] = `Please choose ${article(question.label)}.`;
      attendee.selections[question.key] = null;
    } else if (question.options.some((option) => option.id === chosen)) {
      attendee.selections[question.key] = chosen;
    } else {
      errors[field] = `Please choose one of the listed ${question.label.toLowerCase()} options.`;
    }
  }
  return attendee;
}

function article(label: string): string {
  const lower = label.toLowerCase();
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`;
}
