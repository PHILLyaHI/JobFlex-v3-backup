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

export function GoogleSignupButton({ className, children }: { className: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void signIn("google", { callbackUrl: "/dashboard" });
      }}
    >
      {children}
    </button>
  );
}
