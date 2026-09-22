"use client";

// PARTNER — FORGOT PASSWORD · the form. The sign-in door's plate (one field,
// one button, one line of error) so the two read as one place.
//
// ONE ANSWER for every address. The action returns the same sentence whether
// the address belongs to a partner or not, so this form cannot be used to
// list partner emails; the only other answer is the brake's ("too many").

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { requestInfluencerPasswordReset } from "@/actions/influencer-auth";
import styles from "../partner-door.module.css";

export function PartnerForgotPassword() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address you sign in with.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await requestInfluencerPasswordReset(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(res.message);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setPending(false);
    }
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
          <h1 className={styles.h1}>Forgot your password?</h1>
          <p className={styles.lede}>
            Enter the address you sign in with. If it belongs to a partner account, a one-time link to set a new
            password is on its way — it works for one hour.
          </p>

          {sent ? (
            <p className={styles.note} role="status">
              {sent}
            </p>
          ) : (
            <form onSubmit={onSubmit} noValidate className={styles.form}>
              <label className={styles.fld}>
                <span className={styles.lbl}>Email</span>
                <input
                  className={styles.in}
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <button className={styles.btn} type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send the link"}
              </button>

              <div className={`${styles.err}${error ? "" : ` ${styles.errHidden}`}`} role="alert">
                {error}
              </div>
            </form>
          )}

          <p className={styles.note}>
            Remembered it? <Link href={"/influencer/login" as Route}>Sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
