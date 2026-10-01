"use client";

import { startTransition, useActionState, useState } from "react";
import type { InvitationState } from "@/app/admin/guests/actions";

type Props = {
  action: (state: InvitationState) => Promise<InvitationState>;
  firstName: string;
  hasInvitation: boolean;
  createdAt: string | null;
  archived: boolean;
};

/**
 * Creates or replaces a guest's invitation link. The link is only in this
 * component's memory: it is not stored in the database, the URL or browser
 * storage, and leaving the page discards it.
 */
export function InvitationPanel({ action, firstName, hasInvitation, createdAt, archived }: Props) {
  const [state, issue, pending] = useActionState(action, { status: "idle" } satisfies InvitationState);
  const [copied, setCopied] = useState<string | null>(null);
  const exists = hasInvitation || state.status === "issued";

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied.`);
    } catch {
      setCopied(`Couldn't copy automatically. Select the ${what.toLowerCase()} and copy it by hand.`);
    }
  }

  function onIssue() {
    if (exists && !window.confirm(`Create a new link for ${firstName}? Their current link will stop working immediately.`)) {
      return;
    }
    setCopied(null);
    startTransition(() => issue());
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {state.status === "issued"
          ? "New link created just now."
          : hasInvitation
            ? `A link was created${createdAt ? ` on ${createdAt}` : ""}. For security it can't be shown again.`
            : "No invitation link yet."}
      </p>

      {state.status === "error" && (
        <p role="alert" className="notice-error text-sm">
          {state.message}
        </p>
      )}

      {state.status === "issued" && (
        <div className="notice flex flex-col gap-3" data-testid="issued-invitation">
          <p className="text-sm">
            Copy this now. It&apos;s shown once and isn&apos;t stored. If it&apos;s lost, create a new one.
          </p>
          <label className="field-label" htmlFor="invitation-link">
            Invitation link
          </label>
          <input
            id="invitation-link"
            readOnly
            value={state.link}
            className="field-input font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <label className="field-label" htmlFor="whatsapp-message">
            WhatsApp message
          </label>
          <textarea
            id="whatsapp-message"
            readOnly
            rows={8}
            value={state.message}
            className="field-input text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-small" onClick={() => copy(state.link, "Invitation link")}>
              Copy invitation link
            </button>
            <button type="button" className="btn btn-small" onClick={() => copy(state.message, "WhatsApp message")}>
              Copy WhatsApp message
            </button>
          </div>
          <p role="status" className="text-sm" aria-live="polite">
            {copied}
          </p>
        </div>
      )}

      {!archived && (
        <div>
          <button type="button" className={exists ? "btn" : "btn btn-primary"} onClick={onIssue} disabled={pending}>
            {pending ? "Creating…" : exists ? "Regenerate invitation link" : "Create invitation link"}
          </button>
        </div>
      )}
    </div>
  );
}
