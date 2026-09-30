/** Result returned by form Server Actions and shown by the form that called them. */
export type FormState =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string; errors?: Record<string, string> };

export const IDLE: FormState = { status: "idle" };

export function formError(message: string, errors?: Record<string, string>): FormState {
  return { status: "error", message, errors };
}

export function saved(message: string): FormState {
  return { status: "saved", message };
}

/** Reads a text field from FormData. Missing fields and files read as "". */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
