import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getAdminAccess } from "@/lib/auth/admin";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin sign in | Alex & Joanna",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const access = await getAdminAccess();
  if (access.status === "admin") redirect("/admin");

  const { error } = await searchParams;

  return (
    <PageShell>
      <h1 className="font-serif text-4xl">Admin sign in</h1>
      {error === "link" && (
        <p role="alert" className="text-red-800">
          That sign-in link is invalid or has expired. Please request a new one.
        </p>
      )}
      <LoginForm />
    </PageShell>
  );
}
