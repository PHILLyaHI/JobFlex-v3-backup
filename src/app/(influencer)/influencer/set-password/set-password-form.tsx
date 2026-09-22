"use client";

// PARTNER — SET PASSWORD · the form. Reached from an emailed invite link.
//
// Same plate as the sign-in door beside it. Two states: a link with a token, and
// a link without one — someone pasted the URL, or an email client mangled it.
// The second says so plainly and tells them what to ask for, rather than showing
// a form that cannot work.
//
// The action's refusal is ONE sentence for every failure — expired, already
// used, wrong token, suspended partner — because a distinct message per case
// would let a token be probed. That is decided in actions/influencer-auth.ts;
// this form only shows what it is given.

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { completeInfluencerSetPassword } from "@/actions/influencer-auth";
import styles from "../partner-door.module.css";

function SetPasswordInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await completeInfluencerSetPassword({ token, password });
      if (!res.ok) {
        // The action's own sentence — the same one for every kind of bad link.
        setError(res.error);
        setPending(false);
        return;
      }
      router.push("/influencer/login" as Route);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.trim() : "";
      // A thrown message can arrive redacted in production (Next replaces it
      // with its own fault paragraph), so anything that does not read like a
      // sentence written for a person falls back to one that is.
      setError(
        !msg || msg.length > 200 || /server components render|digest property/i.test(msg)
          ? "That link did not work. Ask your JobFlex contact for a fresh invite."
          : msg,
      );
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="jf-partner-door">
        <main className={styles.field}>
          <section className={styles.frame}>
            <div className={styles.deadMark} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="4" y="10" width="16" height="10" rx="1" />
                <path d="M8 10V7a4 4 0 0 1 8 0" />
              </svg>
            </div>
            <div className={styles.kicker}>Partner</div>
            <h1 className={styles.h1}>This link is incomplete.</h1>
            <p className={styles.lede}>
              A set-password link carries a one-time token, and this one arrived without it. Ask your
              JobFlex contact to send a fresh invite — it takes them one click.
            </p>
            <p className={styles.note}>
              Already set a password?{" "}
              <Link href={"/influencer/login" as Route}>Sign in</Link>
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="jf-partner-door">
      <main className={styles.field}>
        <section className={styles.frame}>
          <div className={styles.brand}>
            <span className={styles.mark}>J</span>
            <span className={styles.brandName}>JobFlex</span>
          </div>

          <div className={styles.kicker}>Partner</div>
          <h1 className={styles.h1}>Set your password.</h1>
          <p className={styles.lede}>
            This is how you will sign in to see what your codes have earned.
          </p>

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <label className={styles.fld}>
              <span className={styles.lbl}>Password</span>
              <span className={styles.pwWrap}>
                <input
                  className={styles.in}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <p className={styles.hint}>At least 8 characters.</p>

            <label className={styles.fld}>
              <span className={styles.lbl}>Confirm password</span>
              <input
                className={styles.in}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>

            <button className={styles.btn} type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save password"}
            </button>

            <div className={`${styles.err}${error ? "" : ` ${styles.errHidden}`}`} role="alert">
              {error}
            </div>
          </form>

          <p className={styles.note}>
            Already set one?{" "}
            <Link href={"/influencer/login" as Route}>Sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

export function PartnerSetPassword() {
  // useSearchParams must sit under a Suspense boundary for static prerender.
  return (
    <React.Suspense fallback={null}>
      <SetPasswordInner />
    </React.Suspense>
  );
}
