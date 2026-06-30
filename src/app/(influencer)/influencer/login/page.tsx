"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";

function InfluencerLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/influencer";
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [inlineError, setInlineError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setInlineError(null);
    try {
      // Authenticate against the dedicated influencer provider (not the app user one).
      const res = await signIn("influencer", { email, password, redirect: false });
      setLoading(false);
      if (!res || res.error) {
        const msg = "Email or password is wrong, or this account isn't active.";
        setInlineError(msg);
        toast.error("Sign in failed", msg);
        return;
      }
      router.push(nextPath as never);
      router.refresh();
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Unexpected error.";
      setInlineError(msg);
      toast.error("Sign in failed", msg);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <section className="w-full max-w-md">
        <div className="quiet-caps mb-3">Partner sign in</div>
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em]">
          Welcome back.
        </h1>
        <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
          Track the subscribers your code referred and the commission you&apos;ve earned.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Continue
          </Button>
          {inlineError && (
            <div className="rounded-[var(--r-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] leading-relaxed text-rose-900">
              <div className="mb-0.5 font-medium">Couldn&apos;t sign in</div>
              <div className="text-rose-800/90">{inlineError}</div>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}

export default function InfluencerLoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense>
      <InfluencerLoginForm />
    </Suspense>
  );
}
