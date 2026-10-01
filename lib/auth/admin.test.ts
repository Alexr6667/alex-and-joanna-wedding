import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin gates used by /admin pages, previews, actions and the export.
const getSession = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { ADMIN_EMAILS: ["alex@example.com", "joanna@example.com"] } }));
vi.mock("./server", () => ({ auth: { getSession: () => getSession() } }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { assertAdmin, requireAdmin, AdminAuthorizationError } = await import("./admin");

const session = (email: string, emailVerified = true) => ({ data: { user: { email, emailVerified } } });

describe("admin gates", () => {
  beforeEach(() => getSession.mockReset());

  it("let an approved, verified admin through", async () => {
    getSession.mockResolvedValue(session("Joanna@Example.com"));
    await expect(requireAdmin()).resolves.toBe("Joanna@Example.com");
    await expect(assertAdmin()).resolves.toBe("Joanna@Example.com");
  });

  it("send anonymous visitors to the login page", async () => {
    getSession.mockResolvedValue({ data: null });
    await expect(requireAdmin()).rejects.toThrow("redirect:/admin/login");
    await expect(assertAdmin()).rejects.toBeInstanceOf(AdminAuthorizationError);
  });

  it("refuse signed-in users who are not approved or not verified", async () => {
    for (const value of [session("guest@example.com"), session("alex@example.com", false)]) {
      getSession.mockResolvedValue(value);
      await expect(requireAdmin()).rejects.toThrow("redirect:/admin");
      await expect(assertAdmin()).rejects.toBeInstanceOf(AdminAuthorizationError);
    }
  });
});
