"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verifySignupEmail } from "@/actions/signupEmailVerification";
import s from "@/components/v3/auth-register-blueprint/auth-register.module.css";
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const [status, setStatus] = useState("working");
  useEffect(() => { let live = true; void verifySignupEmail(token).then(r => { if (live) setStatus(r.ok ? "done" : "error"); }).catch(() => { if (live) setStatus("error"); }); return () => { live = false; }; }, [token]);
  return <div className={s.bp}><main className="auth"><section className="auth-form" role="status" aria-live="polite">
    {status === "working" && <span className="verification-spinner" aria-hidden="true" />}
    <h1 className="auth-h1">{status === "working" ? "Verifying your email…" : status === "done" ? "Email verified" : "This link has expired"}</h1>
    <p className="auth-lede">{status === "done" ? "You may close this window and return to your original tab to continue registering." : status === "error" ? "Return to your signup tab and request another verification email." : "Please wait a moment."}</p>
  </section></main></div>;
}
