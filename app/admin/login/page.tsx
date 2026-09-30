import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getAdminAccess } from "@/lib/auth/admin";
import { CompleteSignIn } from "./complete-sign-in";
import { LoginForm } from "./login-form";

// Neon Auth appends this to the callback URL after verifying a magic link.
const SESSION_VERIFIER_PARAM = "neon_auth_session_verifier";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const access = await getAdminAccess();
  if (access.status === "admin") redirect("/admin");

  const params = await searchParams;
  const completingSignIn = typeof params[SESSION_VERIFIER_PARAM] === "string";

  return (
    <PageShell>
      <h1 className="font-serif text-4xl">Admin sign in</h1>
      {params.error === "link" && (
        <p role="alert" className="text-red-800">
          That sign-in link is invalid or has expired. Please request a new one.
        </p>
      )}
      {completingSignIn ? <CompleteSignIn /> : <LoginForm />}
    </PageShell>
  );
}
