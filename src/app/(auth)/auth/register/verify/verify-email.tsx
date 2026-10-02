"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifySignupEmail } from "@/actions/signupEmailVerification";
import s from "@/components/v3/auth-register-blueprint/auth-register.module.css";
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const [status, setStatus] = useState("working");
  useEffect(() => { let live = true; void verifySignupEmail(token).then(r => { if (live) setStatus(r.ok ? "done" : "error"); }).catch(() => { if (live) setStatus("error"); }); return () => { live = false; }; }, [token]);
  return <div className={s.bp}><main className="verify-page">
    <Link href="/" className="brand"><span className="brand-mark">J</span><span className="brand-name">JobFlex</span></Link>
    <section className="verify-card" role="status" aria-live="polite" aria-atomic="true">
    {status === "working" && <span className="verification-spinner" aria-hidden="true" />}
    {status === "done" && <svg className="verify-check" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="29" /><path d="m18 32 9 9 19-20" pathLength="1" /></svg>}
    <h1 className="auth-h1">{status === "working" ? "Verifying your email…" : status === "done" ? "Email verified" : "This link has expired"}</h1>
    <p className="auth-lede">{status === "done" ? "You may close this window and return to your original tab to continue registering." : status === "error" ? "Return to your signup tab and request another verification email." : "Please wait a moment."}</p>
  </section></main></div>;
}
