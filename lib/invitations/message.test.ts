import { describe, expect, it } from "vitest";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/settings/defaults";
import { invitationUrl, renderWhatsAppMessage } from "./message";

describe("invitation messages", () => {
  it("builds the invitation URL", () => {
    expect(invitationUrl("https://alex-and-joanna-wedding.vercel.app/", "abc")).toBe(
      "https://alex-and-joanna-wedding.vercel.app/invite/abc",
    );
  });

  it("fills the default WhatsApp template", () => {
    const message = renderWhatsAppMessage(DEFAULT_WHATSAPP_TEMPLATE, { firstName: "James", link: "https://x/invite/abc" });
    expect(message).toBe(
      "Hi James,\n\nWe're getting married on 28 August 2027 and we'd love you to join us.\n\nYou can find all the wedding details and RSVP here:\nhttps://x/invite/abc\n\nAlex & Joanna",
    );
  });
});
