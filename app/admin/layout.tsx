// Every admin page reads the session cookie. Neon Auth's getSession() swallows
// Next.js's dynamic-usage signal, so without this Next.js would try to
// prerender these pages at build time.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
