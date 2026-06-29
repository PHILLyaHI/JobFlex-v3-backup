"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { resetPassword } from "@/actions/auth";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 mb-10">
      <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px] leading-none">
        J
      </div>
      <span className="font-display text-[19px] tracking-[-0.015em]">JobFlex</span>
    </Link>
  );
}

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword({ token, password });
      toast.success("Password updated", "Sign in with your new password.");
      router.push("/auth/login" as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't reset your password.";
      setError(msg);
      toast.error("Couldn't reset password", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-[color:var(--paper)] px-6 pt-safe pb-safe">
      <div className="w-full max-w-[400px]">
        <Brand />

        {!token ? (
          <div className="paper-card p-7">
            <div className="h-11 w-11 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] grid place-items-center mb-4">
              <KeyRound className="h-5 w-5 text-[color:var(--ink-muted)]" />
            </div>
            <h1 className="font-display text-[24px] leading-tight tracking-[-0.018em]">
              Reset link missing
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              This page needs a valid reset link. Request a fresh one and we&apos;ll email it over.
            </p>
            <Link href={"/auth/forgot" as never} className="mt-6 block">
              <Button size="lg" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="quiet-caps mb-3">Set a new password</div>
            <h1 className="font-display text-[30px] leading-[1.08] tracking-[-0.02em]">
              Choose a new password.
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              Make it at least 8 characters. You&apos;ll use it to sign in from now on.
            </p>
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <Button type="submit" size="lg" loading={loading} className="w-full">
                Update password
              </Button>
              {error && (
                <div
                  role="alert"
                  className="rounded-[var(--r-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] leading-relaxed text-rose-900"
                >
                  {error}
                </div>
              )}
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

// useSearchParams() must sit under a Suspense boundary for static prerender.
export default function ResetPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetInner />
    </React.Suspense>
  );
}
