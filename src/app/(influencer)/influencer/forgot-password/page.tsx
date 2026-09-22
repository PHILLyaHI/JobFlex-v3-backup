// PARTNER — FORGOT PASSWORD. Route: /influencer/forgot-password.
//
// Public by design, like the sign-in door beside it: src/middleware.ts lets it
// through without a session and the (influencer) layout renders it bare. The
// form asks for an address and always answers the same sentence — whether the
// address is a partner's or not is never said (actions/influencer-auth,
// requestInfluencerPasswordReset). The link it mails lands on
// /influencer/set-password, the same page an invite uses.

import type { Metadata } from "next";
import { PartnerForgotPassword } from "./forgot-form";

export const metadata: Metadata = {
  title: "JobFlex · Reset your partner password",
  robots: { index: false, follow: false },
};

export default function PartnerForgotPasswordPage() {
  return <PartnerForgotPassword />;
}
