"use client";

import { useActionState, useId, useState, startTransition, type FormEvent } from "react";
import { IDLE, type FormState } from "@/lib/forms";
import { earlierChoices, type MenuCategory, type MenuQuestion } from "@/lib/menu/logic";
import type { AttendeeView, RsvpView } from "@/lib/rsvp/service";
import { choiceField, TEXT_LIMITS, type RsvpFormContext } from "@/lib/rsvp/validation";

type Props = {
  /** guest: the guest's own form. admin: an admin editing for a guest. preview: read-only. */
  mode: "guest" | "admin" | "preview";
  action?: (state: FormState, formData: FormData) => Promise<FormState>;
  firstName: string;
  plusOneAllowed: boolean;
  questions: MenuQuestion[];
  /** Every menu category, including switched-off ones, to label earlier choices. */
  menuCategories: MenuCategory[];
  /** Names of every menu option, active or not. */
  optionNames: Record<string, string>;
  ask: RsvpFormContext["ask"];
  initial: RsvpView;
};

type Mode = Props["mode"];

const noop = async (state: FormState) => state;

export function RsvpForm({
  mode,
  action,
  firstName,
  plusOneAllowed,
  questions,
  menuCategories,
  optionNames,
  ask,
  initial,
}: Props) {
  const [state, formAction, pending] = useActionState(action ?? noop, IDLE);
  const [attending, setAttending] = useState<"yes" | "no" | null>(
    initial.attending === null ? null : initial.attending ? "yes" : "no",
  );
  const [bringing, setBringing] = useState<"yes" | "no" | null>(
    initial.bringingPlusOne ? "yes" : initial.attending ? "no" : null,
  );
  const preview = mode === "preview";
  const errors = state.status === "error" ? (state.errors ?? {}) : {};

  // Submitting through onSubmit (rather than the form `action` prop) stops
  // React from resetting the fields after a save, so the form keeps showing
  // what was just saved.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="RSVP form" className="flex flex-col gap-8">
      <StatusMessage state={state} />
      <fieldset disabled={preview || pending} className="flex flex-col gap-8">
        <ChoiceGroup
          name="attending"
          legend={mode === "admin" ? "Response" : "Will you be joining us?"}
          value={attending}
          onChange={(value) => setAttending(value as "yes" | "no")}
          error={errors.attending}
          options={[
            { value: "yes", label: "Happily accepts" },
            { value: "no", label: "Regretfully declines" },
          ]}
        />

        {attending === "yes" && (
          <>
            <AttendeeFields
              mode={mode}
              heading={mode === "admin" ? `${firstName}'s choices` : "Your choices"}
              questions={questions}
              menuCategories={menuCategories}
              optionNames={optionNames}
              prefix="choice"
              dietaryName="dietary"
              askDietary={ask.dietary}
              attendee={initial.guest}
              errors={errors}
            />

            {plusOneAllowed && (
              <div className="flex flex-col gap-6">
                <ChoiceGroup
                  name="bringingPlusOne"
                  legend="Will you be bringing a guest?"
                  value={bringing}
                  onChange={(value) => setBringing(value as "yes" | "no")}
                  error={errors.bringingPlusOne}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
                {bringing === "yes" && (
                  <div className="card flex flex-col gap-6 p-5" data-testid="plus-one-fields">
                    <TextField
                      name="plusOneName"
                      label="Your guest's full name"
                      defaultValue={initial.plusOneName}
                      maxLength={TEXT_LIMITS.name}
                      error={errors.plusOneName}
                      autoComplete="off"
                    />
                    <AttendeeFields
                      mode={mode}
                      heading="Your guest's choices"
                      questions={questions}
                      menuCategories={menuCategories}
                      optionNames={optionNames}
                      prefix="plusOneChoice"
                      dietaryName="plusOneDietary"
                      askDietary={ask.dietary}
                      attendee={initial.plusOne}
                      errors={errors}
                    />
                  </div>
                )}
              </div>
            )}

            {ask.songRequest && (
              <TextField
                name="songRequest"
                label="Song request"
                hint="A song that will get you on the dance floor (optional)"
                defaultValue={initial.songRequest}
                maxLength={TEXT_LIMITS.songRequest}
                error={errors.songRequest}
              />
            )}
          </>
        )}

        {ask.notes && attending !== null && (
          <TextField
            name="notes"
            label="Anything else we should know?"
            hint="Optional"
            multiline
            defaultValue={initial.notes}
            maxLength={TEXT_LIMITS.notes}
            error={errors.notes}
          />
        )}

        {preview ? (
          <p className="notice text-sm" data-testid="preview-form-note">
            Preview only. The form can&apos;t be submitted from here.
          </p>
        ) : (
          <div>
            <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending || attending === null}>
              {pending
                ? "Saving…"
                : mode === "admin"
                  ? "Save RSVP"
                  : initial.attending === null
                    ? "Send reply"
                    : "Update reply"}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function StatusMessage({ state }: { state: FormState }) {
  if (state.status === "saved") {
    return (
      <p role="status" className="notice">
        {state.message}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="notice-error">
        <p>{state.message}</p>
        {state.errors && Object.keys(state.errors).length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {Object.values(state.errors).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return null;
}

function AttendeeFields({
  mode,
  heading,
  questions,
  menuCategories,
  optionNames,
  prefix,
  dietaryName,
  askDietary,
  attendee,
  errors,
}: {
  mode: Mode;
  heading: string;
  questions: MenuQuestion[];
  menuCategories: MenuCategory[];
  optionNames: Record<string, string>;
  prefix: "choice" | "plusOneChoice";
  dietaryName: string;
  askDietary: boolean;
  attendee: AttendeeView;
  errors: Record<string, string>;
}) {
  // Stored choices the form can't offer any more. They are shown as text,
  // never as options, so a withdrawn option can't be chosen again.
  const earlier = earlierChoices(menuCategories, questions, attendee.selections);
  const optionName = (id: string) => optionNames[id] ?? "an option that's been removed";
  const withdrawnOption = new Map(earlier.filter((choice) => choice.asked).map((choice) => [choice.key, choice]));
  const notAsked = earlier.filter((choice) => !choice.asked);

  if (questions.length === 0 && !askDietary && notAsked.length === 0) return null;
  return (
    <section className="flex flex-col gap-6" aria-label={heading}>
      <h3 className="font-serif text-2xl">{heading}</h3>
      {questions.map((question) => {
        const name = choiceField(prefix, question.key);
        const withdrawn = withdrawnOption.get(question.key);
        const stored = attendee.selections[question.key];
        // A stored choice that has since been withdrawn is not preselected.
        const current = withdrawn ? null : stored;
        return (
          <ChoiceGroup
            key={name}
            name={name}
            legend={question.label}
            defaultValue={current}
            note={
              withdrawn &&
              (mode === "admin"
                ? `${optionName(withdrawn.optionId)} was chosen earlier, but it's no longer available. Saving without a new choice clears it.`
                : `You chose ${optionName(withdrawn.optionId)} earlier, but it's no longer available. Please choose again.`)
            }
            error={errors[name]}
            options={question.options.map((option) => ({
              value: option.id,
              label: option.name,
              description: option.description,
            }))}
          />
        );
      })}
      {notAsked.length > 0 && (
        <div className="notice text-sm" data-testid="earlier-choices">
          <p className="font-medium">
            {mode === "admin" ? "Kept from an earlier reply" : "Kept from your earlier reply"}
          </p>
          <p className="mt-1">These are no longer on the menu, so they can&apos;t be changed here.</p>
          <dl className="mt-2 flex flex-col gap-1">
            {notAsked.map((choice) => (
              <div key={choice.key} className="grid gap-x-4 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">{choice.label}</dt>
                <dd className="min-w-0 wrap-anywhere">{optionName(choice.optionId)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {askDietary && (
        <TextField
          name={dietaryName}
          label="Dietary requirements"
          hint="Allergies or dietary needs (optional)"
          defaultValue={attendee.dietaryRequirements}
          maxLength={TEXT_LIMITS.dietary}
          error={errors[dietaryName]}
        />
      )}
    </section>
  );
}

type Option = { value: string; label: string; description?: string | null };

function ChoiceGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  note,
  error,
}: {
  name: string;
  legend: string;
  options: Option[];
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** Read-only text shown above the options, such as an earlier choice that was withdrawn. */
  note?: string;
  error?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  const describedBy = [note ? noteId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <fieldset
      className="min-w-0"
      aria-describedby={describedBy || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="field-label">{legend}</legend>
      {note && (
        <p id={noteId} className="mb-2 text-sm wrap-anywhere text-muted" data-testid="earlier-choice">
          {note}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="card flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3 has-[:checked]:border-accent-strong has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              className="mt-1 accent-[var(--color-accent-strong)]"
              {...(onChange
                ? { checked: value === option.value, onChange: () => onChange(option.value) }
                : { defaultChecked: defaultValue === option.value })}
            />
            <span className="min-w-0">
              <span className="block break-words">{option.label}</span>
              {option.description && (
                <span className="block text-sm break-words text-muted">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </fieldset>
  );
}

function TextField({
  name,
  label,
  hint,
  defaultValue,
  maxLength,
  error,
  multiline = false,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string | null;
  maxLength: number;
  error?: string;
  multiline?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  const shared = {
    id,
    name,
    defaultValue: defaultValue ?? "",
    maxLength,
    className: "field-input",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {multiline ? <textarea rows={4} {...shared} /> : <input type="text" autoComplete={autoComplete} {...shared} />}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
