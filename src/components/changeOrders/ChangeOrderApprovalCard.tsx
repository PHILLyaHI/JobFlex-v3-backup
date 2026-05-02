"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { money, longDate } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Props {
  token: string;
  orgName: string;
  title: string;
  description: string | null;
  amount: number;
  status: string;
  jobTitle: string;
  proposalTotal: number | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
}

export function ChangeOrderApprovalCard({
  token,
  orgName,
  title,
  description,
  amount,
  status,
  jobTitle,
  proposalTotal,
  approvedAt,
  declinedAt,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const positive = amount >= 0;
  const resolved = status === "APPROVED" || status === "DECLINED";

  async function respond(action: "approve" | "decline") {
    setBusy(action);
    try {
      const res = await fetch(`/api/public-co/${token}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toast.success(action === "approve" ? "Approved" : "Declined");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-xl w-full mx-auto paper-card p-10 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl pointer-events-none"
        style={{
          background: positive
            ? "rgba(5,150,105,0.10)"
            : "rgba(225,29,72,0.08)",
        }}
      />
      <div className="relative">
        <div className="quiet-caps mb-3">{orgName} has sent a change order</div>
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em]">{title}</h1>

        <div className="mt-8 flex items-baseline gap-3">
          <div
            className={cn(
              "stat-numeric text-[64px] leading-none",
              positive ? "text-emerald-700" : "text-rose-700",
            )}
          >
            {positive ? "+" : "−"}
            {money(Math.abs(amount))}
          </div>
          <div className="text-[11px] text-[color:var(--ink-muted)] tabular">
            {positive ? "adds to your contract" : "reduces your contract"}
          </div>
        </div>

        {description && (
          <p className="mt-6 text-[14px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
            {description}
          </p>
        )}

        <div className="mt-8 paper-card p-4 flex items-center justify-between text-[12px]">
          <div>
            <div className="quiet-caps">Context</div>
            <div className="text-[color:var(--ink-soft)] mt-1">{jobTitle}</div>
          </div>
          {proposalTotal !== null && (
            <div className="text-right">
              <div className="quiet-caps">Original contract</div>
              <div className="font-display tabular text-[18px] mt-1">{money(proposalTotal)}</div>
            </div>
          )}
        </div>

        {resolved ? (
          <div className="mt-8 flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full grid place-items-center",
                status === "APPROVED"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700",
              )}
            >
              {status === "APPROVED" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </div>
            <div>
              <Badge tone={status === "APPROVED" ? "success" : "danger"}>
                {status === "APPROVED" ? "Approved" : "Declined"}
              </Badge>
              <div className="text-[11px] text-[color:var(--ink-muted)] mt-1 tabular">
                {status === "APPROVED" && approvedAt
                  ? `On ${longDate(approvedAt)}`
                  : status === "DECLINED" && declinedAt
                    ? `On ${longDate(declinedAt)}`
                    : ""}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-10 flex gap-2">
            <Button
              size="lg"
              loading={busy === "approve"}
              onClick={() => respond("approve")}
              icon={<Check className="h-4 w-4" />}
              className="flex-1"
            >
              Approve change
            </Button>
            <Button
              size="lg"
              variant="outline"
              loading={busy === "decline"}
              onClick={() => respond("decline")}
              icon={<X className="h-4 w-4" />}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
