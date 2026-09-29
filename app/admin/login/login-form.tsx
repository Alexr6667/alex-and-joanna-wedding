"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { ADMIN_CALLBACK_PATH, ADMIN_LINK_ERROR_PATH } from "@/lib/auth/routes";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setStatus("sending");

    // The /api/auth route checks the allowlist and enforces these same redirect targets.
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: ADMIN_CALLBACK_PATH,
      errorCallbackURL: ADMIN_LINK_ERROR_PATH,
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p role="status" className="max-w-sm">
        If that address is approved for admin access, a sign-in link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3 text-left">
      <label htmlFor="email" className="text-sm font-medium">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className="rounded border border-line bg-white px-3 py-2"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded bg-ink px-4 py-2 text-paper disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-800">
          Something went wrong sending the link. Please try again.
        </p>
      )}
    </form>
  );
}
