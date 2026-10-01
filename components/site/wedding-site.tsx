import type { ReactNode } from "react";
import { CornerLeaves, LeafDivider, Sprig } from "@/components/decor/sprig";
import type { SiteSettings, FaqEntry } from "@/lib/settings/service";
import { formatDeadline } from "@/lib/rsvp/deadline";
import { RsvpSection, type RsvpSectionProps } from "./rsvp-section";

export const SECTIONS = [
  { id: "home", label: "Home" },
  { id: "the-day", label: "The Day" },
  { id: "locations", label: "Locations" },
  { id: "getting-there", label: "Getting There" },
  { id: "where-to-stay", label: "Where to Stay" },
  { id: "faq", label: "FAQ" },
  { id: "rsvp", label: "RSVP" },
] as const;

type WeddingSiteProps = {
  settings: SiteSettings;
  faqs: FaqEntry[];
  rsvp: RsvpSectionProps;
  /** Preview banner, shown above everything when an admin is previewing. */
  banner?: ReactNode;
};

/**
 * The guest-facing wedding page. Admin previews render this same component, so
 * what an admin sees is what guests see. It only receives general content and,
 * for a guest or guest preview, that one guest's own RSVP.
 */
export function WeddingSite({ settings, faqs, rsvp, banner }: WeddingSiteProps) {
  const { content } = settings;
  return (
    <>
      {banner}
      <SiteNav />
      <main id="main" className="flex-1">
        <Hero intro={content.homepageIntro} deadline={settings.rsvpDeadline} />

        <Section id="the-day" eyebrow="28 August 2027" title="The Day">
          <ol className="mx-auto max-w-md divide-y divide-line border-y border-line">
            {content.timings.map((item, index) => (
              <li key={index} className="flex items-baseline gap-6 py-4">
                <span className="w-20 shrink-0 text-right font-serif text-xl text-accent-strong">{item.time}</span>
                <span className="break-words">{item.label}</span>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-10 max-w-md text-center">
            <h3 className="font-serif text-2xl">Dress code</h3>
            <p className="prose-text mt-2 text-muted">{content.dressCode}</p>
          </div>
        </Section>

        <Section id="locations" eyebrow="Where" title="Locations">
          <div className="grid gap-6 sm:grid-cols-2">
            <Venue heading="Ceremony" venue={content.ceremony} />
            <Venue heading="Reception" venue={content.reception} />
          </div>
        </Section>

        <Section id="getting-there" eyebrow="Travel" title="Getting There">
          <p className="prose-text mx-auto max-w-prose text-center">{content.gettingThere}</p>
        </Section>

        <Section id="where-to-stay" eyebrow="Accommodation" title="Where to Stay">
          <p className="prose-text mx-auto max-w-prose text-center">{content.accommodation}</p>
        </Section>

        <Section id="faq" eyebrow="Questions" title="FAQ">
          {faqs.length === 0 ? (
            <p className="text-center text-muted">Answers to common questions will appear here soon.</p>
          ) : (
            <div className="mx-auto max-w-prose divide-y divide-line border-y border-line">
              {faqs.map((faq) => (
                <details key={faq.id} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-serif text-xl">
                    <span className="break-words">{faq.question}</span>
                    <span aria-hidden="true" className="mt-1 text-accent transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="prose-text mt-3 break-words text-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          )}
        </Section>

        <Section id="rsvp" eyebrow="Kindly reply" title="RSVP">
          <RsvpSection {...rsvp} />
        </Section>
      </main>
      <footer className="border-t border-line py-10 text-center text-sm text-muted">
        <Sprig className="mx-auto mb-3 h-6 w-16 text-accent" />
        Alex &amp; Joanna · 28 August 2027
      </footer>
    </>
  );
}

function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <nav aria-label="Wedding sections" className="mx-auto flex max-w-5xl items-center gap-4 px-gutter py-3">
        <a href="#home" className="shrink-0 font-serif text-xl no-underline">
          A &amp; J
        </a>
        <ul className="-mr-gutter flex flex-1 gap-5 overflow-x-auto pr-gutter text-sm whitespace-nowrap sm:justify-end">
          {SECTIONS.slice(1).map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-block py-2 text-muted no-underline hover:text-ink">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function Hero({ intro, deadline }: { intro: string; deadline: string | null }) {
  return (
    <section id="home" aria-labelledby="home-heading" className="relative overflow-hidden px-gutter pt-14 pb-section">
      <CornerLeaves className="pointer-events-none absolute -top-2 -left-2 h-28 w-28 text-accent opacity-70 sm:h-40 sm:w-40" />
      <CornerLeaves className="pointer-events-none absolute -top-2 -right-2 h-28 w-28 -scale-x-100 text-accent opacity-70 sm:h-40 sm:w-40" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <p className="eyebrow">The wedding of</p>
        <h1 id="home-heading" className="font-serif text-5xl leading-tight sm:text-7xl">
          Alex &amp; Joanna
        </h1>
        <LeafDivider />
        <p className="font-serif text-2xl sm:text-3xl">
          <time dateTime="2027-08-28">Saturday 28 August 2027</time>
        </p>
        <p className="text-muted">London</p>

        <PhotoPlaceholder />

        <p className="prose-text max-w-prose text-lg">{intro}</p>
        {deadline && (
          <p className="text-muted">
            Please reply by <strong className="font-medium text-ink">{formatDeadline(deadline)}</strong>.
          </p>
        )}
        <a href="#rsvp" className="btn btn-primary">
          RSVP
        </a>
      </div>
    </section>
  );
}

/** Stand-in for the couple's photo. Replace with next/image when the photo is ready. */
function PhotoPlaceholder() {
  return (
    <figure className="relative my-4 w-full max-w-xl">
      <div className="card flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-6 text-accent">
        <Sprig className="h-10 w-28" />
        <span className="text-sm text-muted">Photo of Alex &amp; Joanna coming soon</span>
      </div>
      <CornerLeaves className="pointer-events-none absolute -right-5 -bottom-5 h-16 w-16 -scale-x-100 -scale-y-100 text-accent" />
    </figure>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="border-t border-line px-gutter py-section">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 text-center">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={`${id}-heading`} className="mt-2 font-serif text-4xl sm:text-5xl">
            {title}
          </h2>
          <LeafDivider className="mt-5" />
        </header>
        {children}
      </div>
    </section>
  );
}

function Venue({
  heading,
  venue,
}: {
  heading: string;
  venue: SiteSettings["content"]["ceremony"];
}) {
  return (
    <article className="card p-6 text-center sm:p-8">
      <p className="eyebrow">{heading}</p>
      <h3 className="mt-2 font-serif text-3xl break-words">{venue.name}</h3>
      {venue.time && <p className="mt-1 text-accent-strong">{venue.time}</p>}
      <address className="prose-text mt-4 not-italic text-muted">{venue.address}</address>
      {venue.notes && <p className="prose-text mt-4 text-sm">{venue.notes}</p>}
    </article>
  );
}
