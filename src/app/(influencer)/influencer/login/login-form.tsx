"use client";

// PARTNER SIGN IN — the form.
//
// The admin door's composition (src/app/(admin)/admin/login), cut to what this
// door needs: a brand lockup, a mono PARTNER kicker, one heading, two fields,
// one primary button, an inline error slot. No Google, no register link — a
// partner account is created by an admin and arrives as an invite.
//
// ONE ERROR SENTENCE for every failure. The provider cannot tell the visitor
// apart from someone probing for partner emails, so "wrong password", "no such
// partner" and "account suspended" all read the same: a distinct message for
// each is an oracle for which addresses are partners.

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { signIn } from "next-auth/react";
import styles from "../partner-door.module.css";

const FAILED = "That email and password did not match an active partner account.";

function PartnerLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  // Only in-app paths: an absolute URL here would make the login page an open
  // redirect for anyone who can get a partner to click a link.
  const raw = search.get("next") ?? "/influencer";
  const nextPath = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/influencer";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      // The dedicated "influencer" provider, not the app's user one.
      const res = await signIn("influencer", { email, password, redirect: false });
      if (!res || res.error) {
        setError(FAILED);
        setPending(false);
        return;
      }
      router.push(nextPath as Route);
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
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
          <h1 className={styles.h1}>Sign in.</h1>
          <p className={styles.lede}>
            Your codes, what they earned, and where the money is.
          </p>

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

            <label className={styles.fld}>
              <span className={styles.lbl}>Password</span>
              <span className={styles.pwWrap}>
                <input
                  className={styles.in}
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
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

            <button className={styles.btn} type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>

            <div className={`${styles.err}${error ? "" : ` ${styles.errHidden}`}`} role="alert">
              {error}
            </div>
          </form>

          <p className={styles.note}>
            <Link href={"/influencer/forgot-password" as Route}>Forgot your password?</Link>
          </p>
          <p className={styles.note}>
            Never set one? Ask your JobFlex contact to send a fresh invite.
          </p>
        </section>
      </main>
    </div>
  );
}

export function PartnerLogin() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <PartnerLoginForm />
    </Suspense>
  );
}
