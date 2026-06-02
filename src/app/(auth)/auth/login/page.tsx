"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { MobileLogin } from "./mobile-login";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/dashboard";
  const [loading, setLoading] = React.useState(false);
  const [email, setEmail] = React.useState("owner@acme.test");
  const [password, setPassword] = React.useState("password123");

  const [inlineError, setInlineError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setInlineError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      setLoading(false);
      if (!res) {
        const msg =
          "The auth endpoint did not respond. The database probably isn't reachable — see .env.local.";
        setInlineError(msg);
        toast.error("Sign in failed", msg);
        return;
      }
      if (res.error) {
        const msg =
          res.error === "CredentialsSignin"
            ? "Email or password is wrong."
            : `Auth error: ${res.error}. Check server logs — often the database isn't connected yet.`;
        setInlineError(msg);
        toast.error("Sign in failed", msg);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(nextPath as any);
      router.refresh();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setLoading(false);
      const msg = err?.message ?? "Unexpected error — check the terminal running `npm run dev`.";
      setInlineError(msg);
      toast.error("Sign in failed", msg);
    }
  }

  return (
    <main className="min-h-dvh">
      <div className="md:hidden">
        <MobileLogin
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          loading={loading}
          inlineError={inlineError}
          onSubmit={onSubmit}
          onGoogle={() => signIn("google", { callbackUrl: nextPath })}
        />
      </div>
      <div className="hidden md:grid lg:grid-cols-2 min-h-dvh">
      <section className="flex flex-col justify-center p-8 lg:p-16 max-w-xl w-full mx-auto">
        <Link href="/" className="flex items-center gap-2.5 mb-12">
          <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px]">
            J
          </div>
          <span className="font-display text-[19px]">JobFlex</span>
        </Link>
        <div className="quiet-caps mb-3">Sign in</div>
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em]">
          Welcome back.
        </h1>
        <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
          Pick up where you left off — your quotes, clients, and calendar are waiting.
        </p>

        <form onSubmit={onSubmit} className="mt-10 space-y-4">
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
              <div className="font-medium mb-0.5">Couldn&apos;t sign in</div>
              <div className="text-rose-800/90">{inlineError}</div>
            </div>
          )}
        </form>

        <div className="my-8 flex items-center gap-3 text-[11px] text-[color:var(--ink-faint)]">
          <div className="flex-1 border-t border-[color:var(--ink-line)]" />
          <span className="quiet-caps !mb-0">or</span>
          <div className="flex-1 border-t border-[color:var(--ink-line)]" />
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => signIn("google", { callbackUrl: nextPath })}
          className="w-full"
        >
          Continue with Google
        </Button>

        <div className="mt-10 text-[13px] text-[color:var(--ink-muted)]">
          New to JobFlex?{" "}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/auth/register" as any} className="text-[color:var(--ink)] underline underline-offset-[3px]">
            Create an account
          </Link>
        </div>
        <p className="mt-6 text-[11px] text-[color:var(--ink-faint)]">
          Demo · <code className="font-mono">owner@acme.test</code> / <code className="font-mono">password123</code>
        </p>
      </section>

      <section className="hidden lg:block relative bg-[color:var(--paper-deep)] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_20%,rgba(31,122,82,0.08),transparent_60%)]" />
        <div className="absolute bottom-10 right-10 max-w-sm paper-card p-6">
          <div className="quiet-caps mb-2">Today</div>
          <div className="font-display text-[22px] leading-snug tracking-[-0.015em]">
            &ldquo;Rohan Patel accepted the roof proposal &mdash; deposit collected at 10:42am.&rdquo;
          </div>
          <div className="mt-4 text-[11px] text-[color:var(--ink-muted)]">
            The editorial dashboard, in a real contractor&apos;s hands.
          </div>
        </div>
      </section>
      </div>
    </main>
  );
}
