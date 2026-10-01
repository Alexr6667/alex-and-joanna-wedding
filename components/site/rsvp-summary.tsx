import { summaryCategories, type MenuCategory, type MenuQuestion } from "@/lib/menu/logic";
import type { AttendeeView, RsvpView } from "@/lib/rsvp/service";

type Props = {
  view: RsvpView;
  plusOneAllowed: boolean;
  questions: MenuQuestion[];
  menuCategories: MenuCategory[];
  optionNames: Record<string, string>;
};

/** Read-only view of a guest's reply, shown once RSVPs have closed. */
export function RsvpSummary({ view, plusOneAllowed, questions, menuCategories, optionNames }: Props) {
  if (view.attending === null) {
    return (
      <p className="card p-6 text-center" data-testid="rsvp-summary">
        We didn&apos;t receive a reply from you.
      </p>
    );
  }

  return (
    <dl className="card divide-y divide-line px-6" data-testid="rsvp-summary">
      <Row label="Your reply">{view.attending ? "Happily accepts" : "Regretfully declines"}</Row>
      {view.attending && (
        <>
          <AttendeeRows
            attendee={view.guest}
            questions={questions}
            menuCategories={menuCategories}
            optionNames={optionNames}
          />
          {plusOneAllowed && (
            <Row label="Bringing a guest">{view.bringingPlusOne ? (view.plusOneName ?? "Yes") : "No"}</Row>
          )}
          {view.bringingPlusOne && (
            <AttendeeRows
              attendee={view.plusOne}
              questions={questions}
              menuCategories={menuCategories}
              optionNames={optionNames}
              prefix="Your guest's "
            />
          )}
          {view.songRequest && <Row label="Song request">{view.songRequest}</Row>}
        </>
      )}
      {view.notes && <Row label="Notes">{view.notes}</Row>}
    </dl>
  );
}

function AttendeeRows({
  attendee,
  questions,
  menuCategories,
  optionNames,
  prefix = "",
}: {
  attendee: AttendeeView;
  questions: MenuQuestion[];
  menuCategories: MenuCategory[];
  optionNames: Record<string, string>;
  prefix?: string;
}) {
  return (
    <>
      {summaryCategories(menuCategories, questions, attendee.selections).map((category) => {
        const id = attendee.selections[category.key];
        return (
          <Row key={category.key} label={`${prefix}${prefix ? category.label.toLowerCase() : category.label}`}>
            {id ? (optionNames[id] ?? "No longer available") : "Not chosen"}
          </Row>
        );
      })}
      {attendee.dietaryRequirements && (
        <Row label={`${prefix}${prefix ? "dietary requirements" : "Dietary requirements"}`}>
          {attendee.dietaryRequirements}
        </Row>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}
