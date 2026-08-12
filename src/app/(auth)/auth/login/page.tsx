"use client";

// SIGN IN — BLUEPRINT · the page.
// Route: /auth/login.
//
// A verbatim port of the approved mockup `jobflex-auth-login-blueprint.html`.
// Not a redesign: every string of copy, every class name and every CSS
// declaration is the source's (see ./login.module.css for the stylesheet and
// its drop/restore notes).
//
// ── REPLACEMENT, NOT A FORK ────────────────────────────────────────────
// This file REPLACES the previous /auth/login markup in place. It does not
// ship beside it as `/auth/login-blueprint`. That REVERSES the side-by-side
// convention asserted in the header of
// src/app/dashboard/subscription-blueprint/page.tsx ("the standing repo
// convention a donor surface is never overwritten by its successor"); for the
// auth family the instruction is replacement, and that older header comment is
// now stale for anything ported after it.
//
// The old page's `md:hidden` MobileLogin half went with it: the source's own
// media queries (1000px / 560px / max-height 620px) are what makes this page
// responsive, so a second hand-built mobile tree would be a second design.
// ./mobile-login.tsx was deleted — it had exactly one importer, this file.
//
// ── STANDALONE CHROME ──────────────────────────────────────────────────
// Auth pages carry their own frame. Nothing here is mounted inside
// blueprint-shell and no shell file was touched. The wrapper <div> wears the
// literal global class `jf-auth-login`, which is the root every rule in
// login.module.css hangs off; everything else is a hashed local class reached
// through cx() by the source's literal names.
//
// ── AUTH BEHAVIOUR IS THE OLD PAGE'S, UNCHANGED ────────────────────────
// The mockup's <script> is a fake: it accepts the literal password
// "password123" and fakes a 900ms success. Only its UI behaviour is ported —
// the show/hide password toggle, the inline error slot, the "Signing in…" →
// check-mark "Signed in" button progression, and the Google button's busy
// label. The credentials themselves still go through NextAuth exactly as
// before: same signIn("credentials", { redirect: false }) call, same ?next=
// open-redirect guard, same three error branches, same toasts, same
// router.push + refresh, same dev-only prefill. No server action, no API
// route, no Prisma — the data layer was not touched.
//
// Two of the source's strings line up with the live handler by luck and are
// kept: its empty-field message ("Enter your email and password.") becomes the
// client-side guard, and its wrong-password message is byte-identical to the
// one the old page already showed for a CredentialsSignin result.

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "@/components/ui/Toast";
import styles from "./login.module.css";

/**
 * Class list by the SOURCE's literal names, so the JSX below reads as the
 * mockup's markup does and the stylesheet stays diffable against it. Any name
 * the module does not export is emitted literally (none on this page — every
 * class in the login markup has a rule, `is-hidden` included, since the source
 * only ever writes it compounded as `.err.is-hidden`).
 */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => styles[n as string] ?? (n as string))
    .join(" ");
}

/** The source's inline <symbol> sheet, character for character. */
function LoginSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></symbol>
      <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.4 3.2"/><path d="M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M3 3l18 18"/></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></symbol>
      <symbol id="i-google" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.97-6.19A23.9 23.9 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"/>
      </symbol>
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  // Only honor same-site relative paths so `?next=` can't be used as an open
  // redirect (reject absolute URLs and protocol-relative `//evil.com`).
  const rawNext = search.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const [loading, setLoading] = React.useState(false);
  // Prefill demo credentials only in local development — never in production.
  const isDev = process.env.NODE_ENV === "development";
  const [email, setEmail] = React.useState(isDev ? "owner@acme.test" : "");
  const [password, setPassword] = React.useState(isDev ? "password123" : "");

  const [inlineError, setInlineError] = React.useState<string | null>(null);
  // The mockup's three transient UI states, kept as state rather than the
  // source's innerHTML rewrites.
  const [showPw, setShowPw] = React.useState(false);
  const [signedIn, setSignedIn] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The mockup's own guard, message included. It trims only for the
    // emptiness test; the value handed to NextAuth is untouched, as before.
    if (!email.trim() || !password) {
      setInlineError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setInlineError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      setLoading(false);
      if (!res) {
        const msg =
          "The auth endpoint did not respond. The database probably isn't reachable — see .env.local.";
        setInlineError(msg);
        toast.error("Sign in failed", msg);
        return;
      }
      if (res.error) {
        const msg =
          res.error === "CredentialsSignin"
            ? "Email or password is wrong."
            : `Auth error: ${res.error}. Check server logs — often the database isn't connected yet.`;
        setInlineError(msg);
        toast.error("Sign in failed", msg);
        return;
      }
      // The source's terminal state: check mark + "Signed in", button still
      // disabled. Real navigation follows immediately.
      setSignedIn(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(nextPath as any);
      router.refresh();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message ?? "Unexpected error — check the terminal running `npm run dev`.";
      setInlineError(msg);
      toast.error("Sign in failed", msg);
    }
  }

  function onGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    signIn("google", { callbackUrl: nextPath });
  }

  return (
    <div className="jf-auth-login">
      <LoginSprite />

      <main className={cx("auth")}>
        <section className={cx("auth-form")}>
          <Link className={cx("brand")} href="/"><span className={cx("brand-mark")}>J</span><span className={cx("brand-name")}>JobFlex</span></Link>

          <div className={cx("auth-kicker", "kpi-lbl")}>Sign in</div>
          <h1 className={cx("auth-h1")}>Welcome back.</h1>

          <form onSubmit={onSubmit} noValidate>
            <label className={cx("fld")}><span className={cx("fld-lbl")}>Email</span>
              <input
                className={cx("fld-in")}
                type="email"
                id="email"
                placeholder="you@yourshop.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              /></label>

            <label className={cx("fld")}><span className={cx("fld-lbl")}>Password</span>
              <span className={cx("pw-wrap")}>
                <input
                  className={cx("fld-in")}
                  type={showPw ? "text" : "password"}
                  id="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {/* aria-label is the source's and, like the source's, does not
                    flip to "Hide password" when the field is revealed. Ported
                    as authored and flagged rather than silently corrected. */}
                <button className={cx("pw-toggle")} type="button" aria-label="Show password" onClick={() => setShowPw((v) => !v)}><svg className={cx("ic")}><use href={showPw ? "#i-eye-off" : "#i-eye"}/></svg></button>
              </span></label>

            <div className={cx("row")}>
              <span></span>
              <Link className={cx("link-quiet")} href={"/auth/forgot" as never}>Forgot password?</Link>
            </div>

            <button className={cx("btn")} type="submit" disabled={loading || signedIn}>
              {signedIn ? (<><svg className={cx("ic")}><use href="#i-check"/></svg>Signed in</>) : loading ? "Signing in…" : "Sign in"}
            </button>
            <div className={cx("err", !inlineError && "is-hidden")} role="alert">{inlineError}</div>
          </form>

          <div className={cx("divider")}><span className={cx("kpi-lbl")}>or</span></div>
          <button className={cx("btn", "btn--ghost")} type="button" onClick={onGoogle}>
            {googleBusy
              ? (<><svg className={cx("ic")}><use href="#i-check"/></svg>Redirecting to Google…</>)
              : (<><svg className={cx("ic", "ic--brand")}><use href="#i-google"/></svg>Continue with Google</>)}
          </button>

          <div className={cx("foot")}>Don&apos;t have an account? <Link className={cx("link-ink")} href={"/auth/register" as never}>Create an account</Link></div>

        </section>

        <aside className={cx("auth-side")}>
          <div className={cx("side-wash")}></div>
          <figure className={cx("side-card")}>
            <div className={cx("kpi-lbl")}>Today</div>
            <blockquote className={cx("side-q")}>{"“Rohan Patel accepted the roof proposal — deposit collected at 10:42 am.”"}</blockquote>
            <figcaption className={cx("side-n")}>The editorial dashboard, in a real contractor&apos;s hands.</figcaption>
          </figure>
        </aside>
      </main>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary for static prerender
// (Next.js CSR-bailout requirement).
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginInner />
    </React.Suspense>
  );
}
