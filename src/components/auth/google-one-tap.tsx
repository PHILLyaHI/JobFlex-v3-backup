"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

/* GOOGLE ONE TAP (landing-e pass A, 2026-09-11). Google's own prompt in the
   corner of the page: one tap, and the visitor is either signed in (an
   address JobFlex knows) or on step 2 of the signup with the trade
   pre-selected (a new address — parked exactly like the Google button's
   return, lib/googleSignup). Mounted on the landing and on the register
   page's step 1; renders nothing unless NEXT_PUBLIC_GOOGLE_CLIENT_ID is
   set, so every other page and environment is unchanged.

   The script (accounts.google.com/gsi/client) is fetched after `load` and an
   idle slot, never before the hero has painted. The credential is verified
   on the server (/api/auth/google-onetap); the browser never decides who it
   is. The trade and the campaign travel by the landing's cookies, which
   the landing writes after paint — before this can fire. */

type GoogleId = {
  initialize(o: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

export function GoogleOneTap() {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let alive = true;

    const onCredential = async (res: { credential?: string }) => {
      if (!alive || !res?.credential) return;
      try {
        const r = await fetch("/api/auth/google-onetap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: res.credential }),
        });
        const data = (await r.json().catch(() => null)) as { ticket?: string; redirect?: string } | null;
        if (!r.ok || !data) return;
        if (data.ticket) {
          await signIn("signup-ticket", { ticket: data.ticket, callbackUrl: "/dashboard" });
          return;
        }
        if (data.redirect) window.location.assign(data.redirect);
      } catch {
        /* the visitor still has the buttons */
      }
    };

    const start = () => {
      if (!alive || !window.google) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: onCredential,
          context: "signup",
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.prompt();
      } catch {
        /* blocked or misconfigured: nothing to show */
      }
    };

    const load = () => {
      if (!alive) return;
      let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
      if (script && window.google) { start(); return; }
      if (!script) {
        script = document.createElement("script");
        script.src = GSI_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", start, { once: true });
    };

    const idle = () => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(load, { timeout: 4000 });
      else window.setTimeout(load, 1500);
    };
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });

    return () => {
      alive = false;
      window.removeEventListener("load", idle);
      try { window.google?.accounts.id.cancel(); } catch { /* not loaded */ }
    };
  }, []);

  return null;
}
