"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { registerAccount } from "@/actions/auth";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-[8px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[15px] leading-none">
        J
      </div>
      <span className="font-display text-[19px] tracking-[-0.015em]">JobFlex</span>
    </Link>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registerAccount({ name, businessName, email, password });
      // Account exists — establish the session client-side, then land on the app.
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        // Account was created but auto sign-in failed — send them to login.
        toast.success("Account created", "Please sign in to continue.");
        router.push("/auth/login" as never);
        return;
      }
      toast.success("Welcome to JobFlex", "Your workspace is ready.");
      router.push("/dashboard" as never);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't create your account.";
      setError(msg);
      toast.error("Couldn't create account", msg);
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        label="Your name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        label="Business name"
        autoComplete="organization"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        required
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <PasswordInput
        label="Password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <p className="text-[11px] text-[color:var(--ink-faint)]">At least 8 characters.</p>
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Create account
      </Button>
      {error && (
        <div
          role="alert"
          className="rounded-[var(--r-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] leading-relaxed text-rose-900"
        >
          <div className="font-medium mb-0.5">Couldn&apos;t create account</div>
          <div className="text-rose-800/90">{error}</div>
        </div>
      )}
    </form>
  );

  const divider = (
    <div className="my-7 flex items-center gap-3 text-[11px] text-[color:var(--ink-faint)]">
      <div className="flex-1 border-t border-[color:var(--ink-line)]" />
      <span className="quiet-caps !mb-0">or</span>
      <div className="flex-1 border-t border-[color:var(--ink-line)]" />
    </div>
  );

  const googleBtn = (
    <Button
      variant="outline"
      size="lg"
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className="w-full"
      icon={<GoogleIcon className="h-[18px] w-[18px]" />}
    >
      Continue with Google
    </Button>
  );

  const signInLink = (
    <div className="mt-10 text-[13px] text-[color:var(--ink-muted)]">
      Already have an account?{" "}
      <Link
        href={"/auth/login" as never}
        className="text-[color:var(--ink)] underline underline-offset-[3px]"
      >
        Sign in
      </Link>
    </div>
  );

  return (
    <main className="min-h-dvh">
      {/* Mobile */}
      <div className="md:hidden min-h-dvh flex flex-col bg-[color:var(--paper)] px-6 pt-safe pb-safe">
        <div className="mt-8 mb-10 self-start">
          <Brand />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <div className="quiet-caps mb-3">Get started</div>
          <h1 className="font-display text-[30px] leading-[1.08] tracking-[-0.02em]">
            Create your workspace.
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            Your quotes, clients, and calendar — set up in under a minute.
          </p>
          <div className="mt-8">{form}</div>
          {divider}
          {googleBtn}
          {signInLink}
        </div>
      </div>

      {/* Desktop — editorial split, paired with the login page */}
      <div className="hidden md:grid lg:grid-cols-2 min-h-dvh">
        <section className="flex flex-col justify-center p-8 lg:p-16 max-w-xl w-full mx-auto">
          <div className="mb-12">
            <Brand />
          </div>
          <div className="quiet-caps mb-3">Get started</div>
          <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.02em]">
            Create your workspace.
          </h1>
          <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
            Your quotes, clients, and calendar — set up in under a minute.
          </p>
          <div className="mt-10">{form}</div>
          {divider}
          {googleBtn}
          {signInLink}
        </section>

        <section className="hidden lg:block relative bg-[color:var(--paper-deep)] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_20%,rgba(31,122,82,0.08),transparent_60%)]" />
          <div className="absolute bottom-10 right-10 max-w-sm paper-card p-6">
            <div className="quiet-caps mb-2">Day one</div>
            <div className="font-display text-[22px] leading-snug tracking-[-0.015em]">
              &ldquo;Set up the shop, sent my first proposal before lunch.&rdquo;
            </div>
            <div className="mt-4 text-[11px] text-[color:var(--ink-muted)]">
              A clean slate — organization, your login, and a seeded demo to learn from.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
