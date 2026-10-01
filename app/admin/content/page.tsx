import type { Metadata } from "next";
import { ActionForm, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell, PreviewSiteLink } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { MAX_TIMING_ROWS, type SiteContent } from "@/lib/settings/schema";
import { getSiteSettings, listFaqEntries } from "@/lib/settings/service";
import { addFaqAction, deleteFaqAction, moveFaqAction, saveContentAction, updateFaqAction } from "./actions";

export const metadata: Metadata = { title: "Content | Admin" };

const SPARE_TIMING_ROWS = 3;

export default async function ContentPage() {
  const email = await requireAdmin();
  const [settings, faqs] = await Promise.all([getSiteSettings(), listFaqEntries()]);
  const { content } = settings;
  const timingRows = Math.min(content.timings.length + SPARE_TIMING_ROWS, MAX_TIMING_ROWS);

  return (
    <AdminShell email={email} title="Content" actions={<PreviewSiteLink />}>
      <ActionForm action={saveContentAction} label="Site content" className="flex max-w-3xl flex-col gap-8">
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-serif text-2xl">Home</h2>
          <Field name="homepageIntro" label="Welcome text" type="textarea" defaultValue={content.homepageIntro} maxLength={4000} />
        </section>

        <VenueFields prefix="ceremony" heading="Ceremony" venue={content.ceremony} />
        <VenueFields prefix="reception" heading="Reception" venue={content.reception} />

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-serif text-2xl">The Day</h2>
          <p className="text-sm text-muted">One row per moment in the day. Leave a row empty to remove it.</p>
          {Array.from({ length: timingRows }, (_, index) => {
            const row = content.timings[index];
            return (
              <div key={index} className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Field name={`timings.${index}.time`} label={`Time ${index + 1}`} defaultValue={row?.time} maxLength={40} />
                <Field name={`timings.${index}.label`} label={`What happens ${index + 1}`} defaultValue={row?.label} maxLength={200} />
              </div>
            );
          })}
          <Field name="dressCode" label="Dress code" type="textarea" rows={3} defaultValue={content.dressCode} maxLength={4000} />
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-serif text-2xl">Travel and accommodation</h2>
          <Field name="gettingThere" label="Getting there" type="textarea" rows={6} defaultValue={content.gettingThere} maxLength={4000} />
          <Field name="accommodation" label="Where to stay" type="textarea" rows={6} defaultValue={content.accommodation} maxLength={4000} />
        </section>

        <div>
          <SubmitButton>Save content</SubmitButton>
        </div>
      </ActionForm>

      <section aria-labelledby="faq-heading" className="mt-12 max-w-3xl">
        <h2 id="faq-heading" className="mb-4 font-serif text-3xl">
          FAQ
        </h2>
        {faqs.length === 0 && <p className="mb-4 text-muted">No questions yet. Guests see a short placeholder.</p>}
        <ol className="flex flex-col gap-4">
          {faqs.map((faq, index) => (
            <li key={faq.id} className="card p-5" data-testid="faq-entry">
              <ActionForm action={updateFaqAction.bind(null, faq.id)} label={`Edit question ${index + 1}`}>
                <Field name="question" label="Question" defaultValue={faq.question} required maxLength={300} />
                <Field name="answer" label="Answer" type="textarea" defaultValue={faq.answer} required maxLength={4000} />
                <div>
                  <SubmitButton className="btn">Save question</SubmitButton>
                </div>
              </ActionForm>
              <div className="mt-3 flex flex-wrap gap-2">
                {index > 0 && (
                  <ActionForm action={moveFaqAction.bind(null, faq.id, "up")} label={`Move question ${index + 1} up`} showStatus={false}>
                    <SubmitButton className="btn btn-small" pendingLabel="Moving…">
                      Move up
                    </SubmitButton>
                  </ActionForm>
                )}
                {index < faqs.length - 1 && (
                  <ActionForm action={moveFaqAction.bind(null, faq.id, "down")} label={`Move question ${index + 1} down`} showStatus={false}>
                    <SubmitButton className="btn btn-small" pendingLabel="Moving…">
                      Move down
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm
                  action={deleteFaqAction.bind(null, faq.id)}
                  label={`Delete question ${index + 1}`}
                  confirmMessage="Delete this question?"
                >
                  <SubmitButton className="btn btn-small btn-danger" pendingLabel="Deleting…">
                    Delete
                  </SubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ol>

        <div className="card mt-6 p-5">
          <h3 className="mb-4 font-serif text-2xl">Add a question</h3>
          <ActionForm action={addFaqAction} resetOnSuccess label="Add question">
            <Field name="question" label="Question" required maxLength={300} />
            <Field name="answer" label="Answer" type="textarea" required maxLength={4000} />
            <div>
              <SubmitButton>Add question</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </section>
    </AdminShell>
  );
}

function VenueFields({
  prefix,
  heading,
  venue,
}: {
  prefix: string;
  heading: string;
  venue: SiteContent["ceremony"];
}) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="font-serif text-2xl">{heading}</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <Field name={`${prefix}.name`} label="Venue" defaultValue={venue.name} maxLength={200} />
        <Field name={`${prefix}.time`} label="Time" defaultValue={venue.time} maxLength={40} />
      </div>
      <Field name={`${prefix}.address`} label="Address" type="textarea" rows={4} defaultValue={venue.address} maxLength={1000} />
      <Field name={`${prefix}.notes`} label="Notes for guests" type="textarea" rows={3} defaultValue={venue.notes} maxLength={4000} />
    </section>
  );
}
