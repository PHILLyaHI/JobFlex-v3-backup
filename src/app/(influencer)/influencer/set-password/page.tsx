// PARTNER — SET PASSWORD. Route: /influencer/set-password?token=…
//
// Public by design: the visitor holds an emailed one-time token and has no
// session yet. src/middleware.ts returns early for this path so it stays
// reachable, and the (influencer) layout renders it bare because it resolves no
// partner here. The wrapper <div> in ./set-password-form.tsx wears the literal
// global class `jf-partner-door` that ../partner-door.module.css hangs off.

import type { Metadata } from "next";
import { PartnerSetPassword } from "./set-password-form";

export const metadata: Metadata = {
  title: "JobFlex · Set your partner password",
  // An invite link is a credential for as long as it lives; keep it out of
  // search indexes and out of the referrer of anything the page loads.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PartnerSetPasswordPage() {
  return <PartnerSetPassword />;
}
