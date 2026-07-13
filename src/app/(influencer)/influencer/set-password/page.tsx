"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { completeInfluencerSetPassword } from "@/actions/influencer-auth";

function SetPasswordInner() {
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
      await completeInfluencerSetPassword({ token, password });
      toast.success("You're all set", "Sign in to open your partner dashboard.");
      router.push("/influencer/login" as never);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't set your password.";
      setError(msg);
      toast.error("Couldn't set password", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6 pt-safe pb-safe">
      <section className="w-full max-w-md">
        {!token ? (
          <div className="paper-card p-7">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-[var(--r-md)] bg-[color:var(--paper-deep)]">
              <KeyRound className="h-5 w-5 text-[color:var(--ink-muted)]" />
            </div>
            <h1 className="font-display text-[24px] leading-tight tracking-[-0.018em]">Invite link missing</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              This page needs a valid invite link. Ask your JobFlex contact to send a fresh one.
            </p>
          </div>
        ) : (
          <>
            <div className="quiet-caps mb-3">Partner account</div>
            <h1 className="font-display text-[30px] leading-[1.08] tracking-[-0.02em]">Set your password.</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
              Make it at least 8 characters. You&apos;ll use it to sign in to your partner dashboard.
            </p>
            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <PasswordInput
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              <Button type="submit" size="lg" loading={loading} className="w-full">
                Save password
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
            <div className="mt-8 text-[13px] text-[color:var(--ink-muted)]">
              Already set one?{" "}
              <Link
                href={"/influencer/login" as never}
                className="text-[color:var(--ink)] underline underline-offset-[3px]"
              >
                Sign in
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

// useSearchParams() must sit under a Suspense boundary for static prerender.
export default function InfluencerSetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <SetPasswordInner />
    </React.Suspense>
  );
}
