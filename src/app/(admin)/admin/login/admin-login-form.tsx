"use client";

// PLATFORM ADMIN — SIGN IN · the form.
//
// The house auth page's voice (src/app/(auth)/auth/login), cut to the minimum
// this door needs: a brand lockup, a mono PLATFORM kicker, one heading, two
// fields, one primary button, an inline error slot. No Google, no "forgot",
// no register link — the credential pair lives in the environment and there
// is nothing to recover or create.
//
// Submission calls the adminLogin server action. On success the action
// redirects (it throws NEXT_REDIRECT, which the transition carries through as
// a navigation); every failure comes back as { ok: false, error } and lands in
// the error slot.

import * as React from "react";
import { adminLogin } from "@/actions/adminAuth";
import styles from "./admin-login.module.css";

export function AdminLoginForm() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminLogin(username, password);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="jf-admin-login">
      <main className={styles.field}>
        <section className={styles.frame}>
          <div className={styles.brand}>
            <span className={styles.mark}>J</span>
            <span className={styles.brandName}>JobFlex</span>
          </div>

          <div className={styles.kicker}>Platform</div>
          <h1 className={styles.h1}>Admin sign in.</h1>

          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <label className={styles.fld}>
              <span className={styles.lbl}>Username</span>
              <input
                className={styles.in}
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label className={styles.fld}>
              <span className={styles.lbl}>Password</span>
              <input
                className={styles.in}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <button className={styles.btn} type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>

            <div className={`${styles.err}${error ? "" : ` ${styles.errHidden}`}`} role="alert">
              {error}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
