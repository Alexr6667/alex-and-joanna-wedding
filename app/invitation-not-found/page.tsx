import type { Metadata } from "next";
import { InvitationOnly } from "@/components/site/invitation-only";

export const metadata: Metadata = { title: "Invitation link not recognised" };

export default function InvitationNotFoundPage() {
  return (
    <InvitationOnly
      heading="Link not recognised"
      role="alert"
      message="This invitation link isn't valid or is no longer available. It may have been copied incompletely, or replaced with a newer link. Please check the message your link came in, or ask the person who sent it for a new one."
    />
  );
}
