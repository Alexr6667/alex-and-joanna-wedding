import type { MenuCategory, MenuQuestion } from "@/lib/menu/logic";
import { formatDeadline } from "@/lib/rsvp/deadline";
import type { RsvpView } from "@/lib/rsvp/service";
import type { RsvpFormContext } from "@/lib/rsvp/validation";
import { submitGuestRsvp } from "@/app/rsvp-actions";
import { RsvpForm } from "./rsvp-form";
import { RsvpSummary } from "./rsvp-summary";

export type RsvpGuestProps = {
  firstName: string;
  plusOneAllowed: boolean;
  view: RsvpView;
  questions: MenuQuestion[];
  menuCategories: MenuCategory[];
  optionNames: Record<string, string>;
  ask: RsvpFormContext["ask"];
  open: boolean;
  deadline: string | null;
};

export type RsvpSectionProps =
  | { kind: "anonymous" }
  | { kind: "admin-preview" }
  | ({ kind: "guest" | "guest-preview" } & RsvpGuestProps);

export function RsvpSection(props: RsvpSectionProps) {
  if (props.kind === "anonymous") {
    return (
      <div className="mx-auto max-w-md text-center">
        <p>To reply, please open the personal link from your invitation.</p>
        <p className="mt-2 text-sm text-muted">Each invitation has its own link, so there&apos;s nothing to sign in to.</p>
      </div>
    );
  }

  if (props.kind === "admin-preview") {
    return (
      <div className="notice mx-auto max-w-md text-center" data-testid="rsvp-preview-placeholder">
        <p>Guests see their personal RSVP form here.</p>
        <p className="mt-2 text-sm text-muted">
          This general preview doesn&apos;t load any guest&apos;s details. Use &ldquo;Preview as guest&rdquo; on a
          guest&apos;s page to see their form.
        </p>
      </div>
    );
  }

  const { firstName, open, deadline, view } = props;
  const preview = props.kind === "guest-preview";

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-center font-serif text-2xl break-words">Dear {firstName},</p>
      {open ? (
        <p className="mt-2 text-center text-muted">
          {deadline
            ? `Please let us know by ${formatDeadline(deadline)}. You can change your reply until then.`
            : "Please let us know if you can join us. You can come back and change your reply at any time."}
        </p>
      ) : (
        <p className="notice mt-4 text-center" role="status">
          {deadline ? `RSVPs closed on ${formatDeadline(deadline)}.` : "RSVPs are closed."} If something has changed,
          please get in touch with Alex &amp; Joanna directly.
        </p>
      )}

      <div className="mt-8">
        {open ? (
          <RsvpForm
            mode={preview ? "preview" : "guest"}
            action={preview ? undefined : submitGuestRsvp}
            firstName={firstName}
            plusOneAllowed={props.plusOneAllowed}
            questions={props.questions}
            menuCategories={props.menuCategories}
            optionNames={props.optionNames}
            ask={props.ask}
            initial={view}
          />
        ) : (
          <RsvpSummary
            view={view}
            plusOneAllowed={props.plusOneAllowed}
            questions={props.questions}
            menuCategories={props.menuCategories}
            optionNames={props.optionNames}
          />
        )}
      </div>
    </div>
  );
}
