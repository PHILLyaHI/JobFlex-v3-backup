"use client";

// Landing hero — "Sign up with Google". Goes STRAIGHT to Google's consent
// screen (owner's report, 2026-09-03: the button used to be a plain link to
// /auth/register, so it landed on the email form instead of Google). The
// auth callback parks a NEW address as a Google-verified identity and sends
// the visitor into /auth/register at step 2 (that redirect wins over the
// callbackUrl below); an EXISTING address just signs in and belongs in the
// app, not on the signup form (owner, 2026-09-04). next-auth's client
// `signIn` needs no SessionProvider.

import { signIn } from "next-auth/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { writeLandingCookies } from "./landing-variant-effects";
import { signupHref, type LandingVariantKey, type UtmParams } from "./landing-variants";
import { REGISTER } from "./routes";

/* CRO stage 1 (2026-09-09): the trade hero and the visit's utm_* ride along.
   They are written to the memory cookies synchronously before the redirect
   and put in the callbackUrl as well; the auth callback's own redirect for a
   new address (lib/googleSignup.googleSignupReturnUrl) reads the cookies, so
   the register form opens with the trade pre-selected and the campaign kept
   exactly as it does on the email path. An existing address signs in and is
   sent on to the app by the register page. */
export function GoogleSignupButton({
  className,
  children,
  industry,
  utm,
}: {
  className: string;
  children: ReactNode;
  industry?: LandingVariantKey;
  utm?: UtmParams;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      data-cta="google"
      onClick={() => {
        if (busy) return;
        setBusy(true);
        writeLandingCookies(industry, utm);
        void signIn("google", { callbackUrl: signupHref(REGISTER, { industry, utm }) });
      }}
    >
      {children}
    </button>
  );
}
