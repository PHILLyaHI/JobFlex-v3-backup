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
import { useInAppBrowser } from "@/components/auth/use-in-app-browser";
import type { InAppBrowser } from "@/lib/inAppBrowser";
import { rememberFbclidForGoogle, writeLandingCookies } from "./landing-variant-effects";
import { signupHref, type LandingVariantKey, type UtmParams } from "./landing-variants";
import { REGISTER } from "./routes";

/* CRO stage 1 (2026-09-09): the trade hero and the visit's utm_* ride along.
   They are written to the memory cookies synchronously before the redirect
   and put in the callbackUrl as well; the auth callback's own redirect for a
   new address (lib/googleSignup.googleSignupReturnUrl) reads the cookies, so
   the register form opens with the trade pre-selected and the campaign kept
   exactly as it does on the email path. An existing address signs in and is
   sent on to the app by the register page.
   The fbclid too (2026-10-01): in the callbackUrl like the email path's
   register link, and — for the new address, whose return ignores the
   callbackUrl — in FBCLID_COOKIE (marketing consent only). */
export function GoogleSignupButton({
  className,
  children,
  industry,
  utm,
  fbclid,
  inApp: inAppInitial = null,
}: {
  /** What the server read from the request's user agent (src/app/page.tsx). */
  inApp?: InAppBrowser | null;
  className: string;
  children: ReactNode;
  industry?: LandingVariantKey;
  utm?: UtmParams;
  /** Meta's click id from the ad link (landing-variants pickFbclid). */
  fbclid?: string;
}) {
  const [busy, setBusy] = useState(false);
  /* Not offered inside Instagram / Facebook / LINE / TikTok (2026-10-01):
     Google answers "403 disallowed_useragent" in a webview, so the email
     button is the hero's only — and full-width — action there. The server
     says so from the request (2026-10-04: the hero is on screen from the
     first paint, so a button taken away on hydration would be seen going). */
  const inApp = useInAppBrowser(inAppInitial);
  if (inApp) return null;
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
        rememberFbclidForGoogle(fbclid);
        void signIn("google", { callbackUrl: signupHref(REGISTER, { industry, utm, fbclid }) });
      }}
    >
      {children}
    </button>
  );
}
