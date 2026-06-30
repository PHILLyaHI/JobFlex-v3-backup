"use client";
import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GoogleIcon } from "@/components/auth/GoogleIcon";

interface MobileLoginProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  inlineError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
}

export function MobileLogin({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  inlineError,
  onSubmit,
  onGoogle,
}: MobileLoginProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-[color:var(--paper)] px-6 pt-safe pb-safe">
      <Link href="/" className="flex items-center gap-2.5 mt-8 mb-10 self-start">
        <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px] leading-none">
          J
        </div>
        <span className="font-display text-[19px] tracking-[-0.015em]">JobFlex</span>
      </Link>

      <div className="flex-1 flex flex-col justify-center">
        <div className="quiet-caps mb-3">Sign in</div>
        <h1 className="font-display text-[30px] leading-[1.08] tracking-[-0.02em]">
          Welcome back.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
          Pick up where you left off. Quotes, clients, calendar — waiting.
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
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="-mt-1 text-right">
            <Link
              href={"/auth/forgot" as never}
              className="text-[12px] text-[color:var(--ink-muted)] underline underline-offset-[3px] hover:text-[color:var(--ink)]"
            >
              Forgot password?
            </Link>
          </div>
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Continue
          </Button>
          {inlineError && (
            <div
              role="alert"
              className="rounded-[var(--r-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] leading-relaxed text-rose-900"
            >
              <div className="font-medium mb-0.5">Couldn&apos;t sign in</div>
              <div className="text-rose-800/90">{inlineError}</div>
            </div>
          )}
        </form>

        <div className="my-7 flex items-center gap-3 text-[11px] text-[color:var(--ink-faint)]">
          <div className="flex-1 border-t border-[color:var(--ink-line)]" />
          <span className="quiet-caps !mb-0">or</span>
          <div className="flex-1 border-t border-[color:var(--ink-line)]" />
        </div>

        <Button
          variant="outline"
          size="lg"
          onClick={onGoogle}
          className="w-full"
          icon={<GoogleIcon className="h-[18px] w-[18px]" />}
        >
          Continue with Google
        </Button>

        <div className="mt-10 text-[13px] text-[color:var(--ink-muted)]">
          New to JobFlex?{" "}
          <Link
            href={"/auth/register" as never}
            className="text-[color:var(--ink)] underline underline-offset-[3px]"
          >
            Create an account
          </Link>
        </div>
      </div>

      <p className="mt-8 text-[10px] text-[color:var(--ink-faint)] tracking-[0.01em]">
        Demo &middot; <code className="font-mono">owner@acme.test</code> /{" "}
        <code className="font-mono">password123</code>
      </p>
    </div>
  );
}
