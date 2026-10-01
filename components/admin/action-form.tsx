"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { IDLE, type FormState } from "@/lib/forms";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormStateContext = createContext<{ state: FormState; pending: boolean }>({ state: IDLE, pending: false });

/**
 * A form that calls a Server Action and shows its result. Submitting through
 * onSubmit keeps what the admin typed if validation fails (a plain `action`
 * form would reset). `resetOnSuccess` clears the form after a successful
 * create.
 */
export function ActionForm({
  action,
  children,
  className = "flex flex-col gap-4",
  resetOnSuccess = false,
  confirmMessage,
  label,
  showStatus = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  label?: string;
  showStatus?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "saved") formRef.current?.reset();
  }, [state, resetOnSuccess]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  }

  return (
    <FormStateContext.Provider value={{ state, pending }}>
      <form ref={formRef} onSubmit={handleSubmit} noValidate aria-label={label} className={className}>
        {showStatus && <FormStatus />}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function FormStatus() {
  const { state } = useContext(FormStateContext);
  if (state.status === "saved") {
    return (
      <p role="status" className="notice text-sm">
        {state.message}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="notice-error text-sm">
        {state.message}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "btn btn-primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useContext(FormStateContext);
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </button>
  );
}

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
  required?: boolean;
  maxLength?: number;
  className?: string;
} & (
  | { type?: "text" | "date" | "search"; rows?: never; options?: never }
  | { type: "textarea"; rows?: number; options?: never }
  | { type: "select"; options: { value: string; label: string }[]; rows?: never }
);

/** Labelled input that shows the Server Action's error for its `name`. */
export function Field({
  name,
  label,
  hint,
  defaultValue,
  required,
  maxLength,
  className = "",
  type = "text",
  rows,
  options,
}: FieldProps) {
  const { state } = useContext(FormStateContext);
  const error = state.status === "error" ? state.errors?.[name] : undefined;
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const shared = {
    id,
    name,
    defaultValue: defaultValue ?? "",
    required,
    className: "field-input",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-muted"> (required)</span>}
      </label>
      {type === "textarea" ? (
        <textarea rows={rows ?? 4} maxLength={maxLength} {...shared} />
      ) : type === "select" ? (
        <select {...shared}>
          {options!.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input type={type} maxLength={maxLength} {...shared} />
      )}
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

export function Checkbox({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 size-4 accent-[var(--color-accent-strong)]"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="field-hint">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
