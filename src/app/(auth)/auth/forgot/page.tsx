"use client";
import * as React from "react";
import Link from "next/link";
import { MailCheck, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { requestPasswordReset } from "@/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset({ email });
      // Always lands here regardless of whether the email exists (anti-enumeration).
      setSent(true);
    } catch {
      // The action never throws for normal input; if it does, keep the generic
      // confirmation rather than revealing anything.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-[color:var(--paper)] px-6 pt-safe pb-safe">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="flex items-center gap-2.5 mb-10">
          <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px] leading-none">
            J
          </div>
          <span className="font-display text-[19px] tracking-[-0.015em]">JobFlex</span>
        </Link>

        {sent ? (
          <div className="paper-card p-7">
            <div className="h-11 w-11 rounded-[var(--r-md)] bg-[color:var(--accent-soft)] grid place-items-center mb-4">
              <MailCheck className="h-5 w-5 text-[color:var(--accent-ink)]" />
            </div>
            <h1 className="font-display text-[24px] leading-tight tracking-[-0.018em]">
              Check your inbox
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              If an account exists for <span className="text-[color:var(--ink)]">{email}</span>,
              we&apos;ve sent a link to reset your password. It expires in an hour.
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--ink-faint)]">
              Didn&apos;t get it? Check spam, or{" "}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-[color:var(--ink)] underline underline-offset-[3px]"
              >
                try a different email
              </button>
              .
            </p>
            <Link
              href={"/auth/login" as never}
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="quiet-caps mb-3">Forgot password</div>
            <h1 className="font-display text-[30px] leading-[1.08] tracking-[-0.02em]">
              Reset your password.
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              Enter your account email and we&apos;ll send you a secure link to set a new one.
            </p>
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" size="lg" loading={loading} className="w-full">
                Send reset link
              </Button>
            </form>
            <Link
              href={"/auth/login" as never}
              className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
