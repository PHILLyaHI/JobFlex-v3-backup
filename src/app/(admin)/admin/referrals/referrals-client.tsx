"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { money, relative } from "@/lib/format";
import { adminRetryReferralCredit, adminMarkReferralPaid } from "@/actions/referrals";

export interface ConversionDTO {
  id: string;
  signupEmail: string;
  signupOrgName: string | null;
  referrerName: string;
  referrerOrgName: string;
  code: string;
  status: string;
  rewardCents: number | null;
  rewardAppliedAt: string | null;
  createdAt: string;
  convertedAt: string | null;
}

const STATUS_TONE: Record<string, "success" | "warn" | "neutral" | "danger" | "accent"> = {
  PENDING: "neutral",
  CONVERTED: "warn",
  PAID: "success",
};

// applyReferralReward's skip reasons, translated for the admin.
const SKIP_REASON: Record<string, string> = {
  "not-converted": "The referred workspace hasn't paid yet.",
  "already-applied": "This credit was already applied.",
  "no-stripe-customer": "The referrer has no Stripe customer yet — it will apply when they subscribe.",
  "stripe-disabled": "Stripe isn't configured in this environment.",
  "stripe-writes-disabled": "Stripe live writes are disabled (STRIPE_ALLOW_LIVE_WRITES).",
  "no-priced-plan": "The referrer's plan has no price to base the credit on.",
};

export function ReferralsAdminClient({ conversions }: { conversions: ConversionDTO[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function retry(id: string) {
    setBusyId(id);
    try {
      const res = await adminRetryReferralCredit(id);
      if (res.applied) {
        toast.success("Credit applied", "The referrer's Stripe balance was credited.");
      } else {
        toast.error("Not applied", SKIP_REASON[res.reason ?? ""] ?? res.reason ?? "Unknown reason.");
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(id: string) {
    setBusyId(id);
    try {
      await adminMarkReferralPaid(id, "Settled manually by admin");
      toast.success("Marked credited");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<ConversionDTO>[] = [
    {
      key: "signup",
      header: "Referred signup",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-[color:var(--ink)] truncate">{r.signupEmail}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
            {r.signupOrgName ?? "no workspace yet"} · {relative(new Date(r.createdAt))}
          </div>
        </div>
      ),
    },
    {
      key: "referrer",
      header: "Referrer",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[color:var(--ink)] truncate">{r.referrerName}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
            {r.referrerOrgName} · <span className="font-mono">{r.code}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>
          {r.status === "PAID" ? "credited" : r.status === "CONVERTED" ? "credit owed" : "pending"}
        </Badge>
      ),
    },
    {
      key: "reward",
      header: "Credit",
      align: "right",
      render: (r) => (
        <span className="tabular">{r.rewardCents != null ? money(r.rewardCents / 100) : "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "CONVERTED" && !r.rewardAppliedAt ? (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => markPaid(r.id)}>
              Mark credited
            </Button>
            <Button size="sm" loading={busyId === r.id} onClick={() => retry(r.id)}>
              Apply credit
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={conversions}
      rowKey={(r) => r.id}
      empty={
        <EmptyState
          icon={<Gift className="h-5 w-5" />}
          title="No referrals yet"
          description="Conversions appear here as contractors sign up with member referral codes."
        />
      }
    />
  );
}
