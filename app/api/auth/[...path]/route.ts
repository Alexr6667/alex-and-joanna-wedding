import { auth } from "@/lib/auth/server";
import { decideMagicLinkRequest } from "@/lib/auth/magic-link-request";
import { env } from "@/lib/env";

type RouteContext = { params: Promise<{ path: string[] }> };

const neonAuth = auth.handler();

// The only state-changing auth calls this app makes. Everything else (password
// sign-up, social sign-in, account changes) is refused here so the proxy cannot
// be used to create accounts the app does not need.
const MAGIC_LINK_PATH = "sign-in/magic-link";
const SIGN_OUT_PATH = "sign-out";

const notFound = () => Response.json({ message: "Not found" }, { status: 404 });

export const GET = neonAuth.GET;

export async function POST(request: Request, context: RouteContext) {
  const path = (await context.params).path.join("/");

  if (path === SIGN_OUT_PATH) return neonAuth.POST(request, context);
  if (path !== MAGIC_LINK_PATH) return notFound();

  const body: unknown = await request.json().catch(() => null);
  const decision = decideMagicLinkRequest(body, env.ADMIN_EMAILS);

  if (decision.action === "reject") {
    return Response.json({ message: "A valid email address is required" }, { status: 400 });
  }
  if (decision.action === "ignore") {
    // Same shape as Neon Auth's success response.
    return Response.json({ status: true });
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const forwarded = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(decision.body),
  });
  return neonAuth.POST(forwarded, context);
}
