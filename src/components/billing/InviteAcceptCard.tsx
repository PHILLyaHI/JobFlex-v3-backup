"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { acceptInvite, declineInvite } from "@/actions/team";
import { longDate } from "@/lib/format";

interface InviteAcceptCardProps {
  token: string;
  orgName: string;
  role: string;
  inviterName: string | null;
  expiresAt: Date;
  invitedEmail: string;
}

export function InviteAcceptCard({
  token,
  orgName,
  role,
  inviterName,
  expiresAt,
  invitedEmail,
}: InviteAcceptCardProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function handle(action: "accept" | "decline") {
    setBusy(action);
    try {
      if (action === "accept") {
        const res = await acceptInvite(token);
        toast.success("Welcome aboard");
        if (res.requiresLogin) {
          router.push(`/auth/login?next=/dashboard` as any);
        } else {
          router.push("/dashboard");
        }
      } else {
        await declineInvite(token);
        toast.success("Declined");
        router.push("/");
      }
    } catch (err: any) {
      toast.error("Couldn't complete", err?.message);
      setBusy(null);
    }
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
      <div className="quiet-caps mb-3">You're invited</div>
      <h1 className="font-display text-[36px] leading-[1.05] tracking-[-0.02em]">
        Join <span className="italic">{orgName}</span>
      </h1>

      <div className="mt-6 space-y-2.5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="quiet-caps w-20">Role</span>
          <Badge tone="accent">{role.toLowerCase()}</Badge>
        </div>
        {inviterName && (
          <div className="flex items-center gap-2">
            <span className="quiet-caps w-20">Invited by</span>
            <span className="text-[color:var(--ink-soft)]">{inviterName}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="quiet-caps w-20">For</span>
          <span className="text-[color:var(--ink-soft)]">{invitedEmail}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="quiet-caps w-20">Expires</span>
          <span className="text-[color:var(--ink-soft)] tabular">{longDate(expiresAt)}</span>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        <Button
          size="lg"
          loading={busy === "accept"}
          onClick={() => handle("accept")}
          icon={<Check className="h-4 w-4" />}
          className="flex-1"
        >
          Accept &amp; join
        </Button>
        <Button
          size="lg"
          variant="outline"
          loading={busy === "decline"}
          onClick={() => handle("decline")}
          icon={<X className="h-4 w-4" />}
        >
          Decline
        </Button>
      </div>
    </motion.div>
  );
}
