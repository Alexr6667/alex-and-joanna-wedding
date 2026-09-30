import type { Metadata } from "next";
import { ActionForm, Checkbox, Field, SubmitButton } from "@/components/admin/action-form";
import { AdminShell, PreviewSiteLink } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { listMenu } from "@/lib/menu/service";
import { getSiteSettings } from "@/lib/settings/service";
import {
  addOptionAction,
  moveOptionAction,
  setMenuEnabledAction,
  updateCategoryAction,
  updateOptionAction,
} from "./actions";

export const metadata: Metadata = { title: "Menu | Admin" };

export default async function MenuPage() {
  const email = await requireAdmin();
  const [settings, { categories, options }] = await Promise.all([getSiteSettings(), listMenu()]);

  return (
    <AdminShell email={email} title="Menu and drinks" actions={<PreviewSiteLink />}>
      <section className="card mb-8 flex flex-col gap-3 p-5" aria-labelledby="menu-status">
        <h2 id="menu-status" className="font-serif text-2xl">
          Menu choices are {settings.menuEnabled ? "on" : "off"}
        </h2>
        <p className="text-sm text-muted">
          {settings.menuEnabled
            ? "Guests who accept are asked to choose one option in each enabled category that has active options."
            : "Guests don't see any food or drink questions. You can set up options now and switch this on later."}
        </p>
        <ActionForm action={setMenuEnabledAction.bind(null, !settings.menuEnabled)} label="Switch menu choices">
          <div>
            <SubmitButton className={settings.menuEnabled ? "btn" : "btn btn-primary"} pendingLabel="Saving…">
              {settings.menuEnabled ? "Turn menu choices off" : "Turn menu choices on"}
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      <div className="flex flex-col gap-8">
        {categories.map((category) => {
          const categoryOptions = options.filter((option) => option.category === category.key);
          return (
            <section key={category.key} aria-labelledby={`category-${category.key}`} className="card p-5" data-testid={`menu-category-${category.key}`}>
              <h2 id={`category-${category.key}`} className="mb-4 font-serif text-2xl">
                {category.label}
                {!category.enabled && <span className="text-base text-muted"> (not asked)</span>}
              </h2>

              <ActionForm
                action={updateCategoryAction.bind(null, category.key)}
                label={`${category.label} settings`}
                className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <Field name="label" label="Category name" defaultValue={category.label} maxLength={60} className="flex-1" />
                <div className="pb-3">
                  <Checkbox name="enabled" label="Ask guests" defaultChecked={category.enabled} />
                </div>
                <SubmitButton className="btn">Save category</SubmitButton>
              </ActionForm>

              {categoryOptions.length === 0 ? (
                <p className="mb-4 text-sm text-muted">No options yet. Guests aren&apos;t asked about this until you add one.</p>
              ) : (
                <ol className="mb-6 flex flex-col gap-3">
                  {categoryOptions.map((option, index) => (
                    <li key={option.id} className="border border-line p-4" data-testid="menu-option">
                      <ActionForm
                        action={updateOptionAction.bind(null, option.id)}
                        label={`Edit ${option.name}`}
                        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                      >
                        <Field name="name" label="Name" defaultValue={option.name} required maxLength={120} />
                        <Field name="description" label="Description" defaultValue={option.description} maxLength={500} />
                        <div className="pb-3">
                          <Checkbox name="active" label="Available" defaultChecked={option.active} />
                        </div>
                        <div className="sm:col-span-3">
                          <SubmitButton className="btn btn-small">Save option</SubmitButton>
                          {!option.active && <span className="ml-3 text-sm text-muted">Not shown to guests</span>}
                        </div>
                      </ActionForm>
                      <div className="mt-2 flex gap-2">
                        {index > 0 && (
                          <ActionForm action={moveOptionAction.bind(null, option.id, "up")} label={`Move ${option.name} up`} showStatus={false}>
                            <SubmitButton className="btn btn-small" pendingLabel="Moving…">
                              Move up
                            </SubmitButton>
                          </ActionForm>
                        )}
                        {index < categoryOptions.length - 1 && (
                          <ActionForm action={moveOptionAction.bind(null, option.id, "down")} label={`Move ${option.name} down`} showStatus={false}>
                            <SubmitButton className="btn btn-small" pendingLabel="Moving…">
                              Move down
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <ActionForm
                action={addOptionAction.bind(null, category.key)}
                resetOnSuccess
                label={`Add ${category.label} option`}
                className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <Field name="name" label={`New ${category.label.toLowerCase()} option`} required maxLength={120} />
                <Field name="description" label="Description (optional)" maxLength={500} />
                <SubmitButton className="btn">Add option</SubmitButton>
              </ActionForm>
            </section>
          );
        })}
      </div>
    </AdminShell>
  );
}
