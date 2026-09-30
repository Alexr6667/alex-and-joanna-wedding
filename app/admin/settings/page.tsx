import type { Metadata } from "next";
import { ActionForm, Checkbox, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell, PreviewSiteLink } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { getSiteSettings } from "@/lib/settings/service";
import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings | Admin" };

export default async function SettingsPage() {
  const email = await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <AdminShell email={email} title="Settings" actions={<PreviewSiteLink />}>
      <ActionForm action={saveSettingsAction} label="Site settings" className="flex max-w-2xl flex-col gap-8">
        <fieldset className="card flex flex-col gap-3 p-5">
          <legend className="px-1 font-serif text-2xl">Site access</legend>
          <AccessOption
            value="private"
            current={settings.accessMode}
            label="Private"
            hint="Only guests who have opened their invitation link can see the wedding details. Everyone else sees an invitation-only page."
          />
          <AccessOption
            value="public"
            current={settings.accessMode}
            label="Public"
            hint="Anyone can see the general wedding details. Replying still needs a personal invitation link, and guest information is never public."
          />
        </fieldset>

        <fieldset className="card flex flex-col gap-4 p-5">
          <legend className="px-1 font-serif text-2xl">RSVPs</legend>
          <Field
            name="rsvpDeadline"
            label="RSVP deadline"
            type="date"
            defaultValue={settings.rsvpDeadline ?? ""}
            hint="Guests can reply or change their reply until the end of this day (UK time). Leave empty to keep RSVPs open."
          />
          <Checkbox
            name="menuEnabled"
            label="Ask guests for food and drink choices"
            hint="Set up the options on the Menu page. When off, guests don't see any menu questions."
            defaultChecked={settings.menuEnabled}
          />
          <Checkbox name="askDietary" label="Ask about dietary requirements" defaultChecked={settings.askDietary} />
          <Checkbox name="askSongRequest" label="Ask for a song request" defaultChecked={settings.askSongRequest} />
          <Checkbox name="askNotes" label="Ask for any other notes" defaultChecked={settings.askNotes} />
        </fieldset>

        <fieldset className="card flex flex-col gap-4 p-5">
          <legend className="px-1 font-serif text-2xl">WhatsApp message</legend>
          <Field
            name="whatsappTemplate"
            label="Message template"
            type="textarea"
            rows={9}
            maxLength={2000}
            defaultValue={settings.whatsappTemplate}
            hint="Used by the Copy WhatsApp message button. {first_name} becomes the guest's first name and {link} their invitation link. Clear the box to go back to the default."
          />
        </fieldset>

        <div>
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </ActionForm>
    </AdminShell>
  );
}

function AccessOption({
  value,
  current,
  label,
  hint,
}: {
  value: "private" | "public";
  current: string;
  label: string;
  hint: string;
}) {
  const id = `access-${value}`;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="radio"
        name="accessMode"
        value={value}
        defaultChecked={current === value}
        aria-describedby={`${id}-hint`}
        className="mt-1 size-4 accent-[var(--color-accent-strong)]"
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      </div>
    </div>
  );
}
