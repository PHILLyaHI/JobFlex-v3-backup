"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { acceptWorkerInvite, declineWorkerInvite } from "@/actions/workers";
import { roleLabel } from "@/lib/prismaEnums";

interface WorkerInviteCardProps {
  token: string;
  orgName: string;
  workerName: string;
  email: string;
  role: string;
}

export function WorkerInviteCard({ token, orgName, workerName, email, role }: WorkerInviteCardProps) {
  const router = useRouter();
  const [stage, setStage] = React.useState<"intro" | "password" | "declined">("intro");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState<null | "accept" | "decline">(null);

  async function handleDecline() {
    setBusy("decline");
    try {
      await declineWorkerInvite(token);
      setStage("declined");
    } catch (err) {
      toast.error("Couldn't decline", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password too short", "Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match", "Re-enter the same password twice.");
      return;
    }
    setBusy("accept");
    try {
      // Sets the password, signs the worker in, and redirects to the dashboard —
      // all in one server step, so there's no second login screen.
      await acceptWorkerInvite({ token, password });
      // Fallback navigation if the server action didn't already redirect.
      router.push("/dashboard/jobs");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't accept", err instanceof Error ? err.message : undefined);
      setBusy(null);
    }
  }

  if (stage === "declined") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-md mx-auto paper-card p-10 text-center"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-black/[0.04] text-[color:var(--ink-muted)]">
          <X className="h-5 w-5" />
        </div>
        <h1 className="font-display text-[26px] leading-[1.1] tracking-[-0.02em]">
          Invite declined
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-muted)]">
          We&apos;ve let {orgName} know. If this was a mistake, ask them to send you a new invite.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md mx-auto paper-card p-10 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[color:var(--accent)]/[0.07] blur-3xl pointer-events-none"
      />
      <div className="quiet-caps mb-3">You&apos;re invited</div>
      <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em]">
        Join <span className="italic">{orgName}</span>
      </h1>

      <div className="mt-6 space-y-2.5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="quiet-caps w-20">Role</span>
          <Badge tone="accent">{roleLabel(role)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="quiet-caps w-20">For</span>
          <span className="text-[color:var(--ink-soft)]">{email}</span>
        </div>
      </div>

      {stage === "intro" ? (
        <>
          <p className="mt-6 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
            Accept to set a password and get your own login. You&apos;ll see the jobs assigned to
            you and your schedule.
          </p>
          <div className="mt-8 flex gap-2">
            <Button
              size="lg"
              onClick={() => setStage("password")}
              icon={<Check className="h-4 w-4" />}
              className="flex-1"
            >
              Accept &amp; set up
            </Button>
            <Button
              size="lg"
              variant="outline"
              loading={busy === "decline"}
              onClick={handleDecline}
              icon={<X className="h-4 w-4" />}
            >
              Decline
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={handleAccept} className="mt-7 space-y-4">
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            Set a password for <span className="text-[color:var(--ink)]">{workerName}</span>.
          </p>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters"
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
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStage("intro")}
              icon={<ArrowLeft className="h-4 w-4" />}
              disabled={busy === "accept"}
            >
              Back
            </Button>
            <Button type="submit" size="lg" loading={busy === "accept"} className="flex-1">
              Create account &amp; continue
            </Button>
          </div>
        </form>
      )}
    </motion.div>
  );
}
