"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check, Clock, X, Sparkles, TrendingUp, MousePointerClick } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money, shortDate } from "@/lib/format";
import { listStagger, listItem } from "@/lib/theme/motion";
import { markPayoutPaid } from "@/actions/influencer";
import { useRouter } from "next/navigation";

export interface StatementRow {
  id: string;
  influencerName: string;
  clicks: number;
  conversions: number;
  earnings: number;
  period: string;
}

export interface PayoutRow {
  id: string;
  influencerName: string;
  amount: number;
  status: string;
  period: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface Props {
  statements: StatementRow[];
  payouts: PayoutRow[];
  currentPeriod: string;
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "danger" | "warn"> = {
  PENDING: "warn",
  PAID: "success",
  FAILED: "danger",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  PAID: <Check className="h-3 w-3" />,
  FAILED: <X className="h-3 w-3" />,
};

export function InfluencerDashboard({ statements, payouts, currentPeriod }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  const totals = statements
    .filter((s) => s.period === currentPeriod)
    .reduce(
      (a, s) => {
        a.clicks += s.clicks;
        a.conversions += s.conversions;
        a.earnings += s.earnings;
        return a;
      },
      { clicks: 0, conversions: 0, earnings: 0 },
    );
  const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;

  async function pay(id: string) {
    setBusy(id);
    try {
      await markPayoutPaid(id);
      toast.success("Marked paid");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't update", err?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* This-period rollup */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat
          label="Clicks · this period"
          value={totals.clicks.toLocaleString()}
          icon={<MousePointerClick className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Conversions"
          value={totals.conversions.toLocaleString()}
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Conversion rate"
          value={`${conversionRate.toFixed(1)}%`}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone={conversionRate >= 5 ? "success" : conversionRate >= 2 ? "accent" : "warn"}
        />
        <Stat
          label="Earnings"
          value={money(totals.earnings)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="accent"
        />
      </div>

      {/* Per-influencer this-period statements */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Statements · {currentPeriod}</CardTitle>
            <CardSubtitle>Per-influencer rollup for the current period.</CardSubtitle>
          </div>
        </CardHeader>
        {statements.filter((s) => s.period === currentPeriod).length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No statements recorded for {currentPeriod} yet.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {statements
              .filter((s) => s.period === currentPeriod)
              .map((s) => (
                <li key={s.id} className="py-3.5 grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 font-medium text-[13px] text-[color:var(--ink)]">
                    {s.influencerName}
                  </div>
                  <div className="col-span-2 text-[11px] text-[color:var(--ink-muted)] tabular">
                    {s.clicks.toLocaleString()} clicks
                  </div>
                  <div className="col-span-2 text-[11px] text-[color:var(--ink-muted)] tabular">
                    {s.conversions} conv.
                  </div>
                  <div className="col-span-2 text-[11px] text-[color:var(--ink-muted)] tabular">
                    {s.clicks > 0 ? ((s.conversions / s.clicks) * 100).toFixed(1) : "0.0"}%
                  </div>
                  <div className="col-span-2 text-right font-display tabular text-[14px]">
                    {money(s.earnings)}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {/* Payouts table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payouts</CardTitle>
            <CardSubtitle>Payment history across all periods.</CardSubtitle>
          </div>
        </CardHeader>
        {payouts.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No payouts recorded yet.</p>
        ) : (
          <motion.ul
            variants={listStagger}
            initial="initial"
            animate="animate"
            className="divide-y divide-[color:var(--ink-line)]"
          >
            {payouts.map((p) => (
              <motion.li
                key={p.id}
                variants={listItem}
                className="py-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[13px] text-[color:var(--ink)]">
                    {p.influencerName}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 tabular">
                    {p.period} ·{" "}
                    {p.paidAt ? `paid ${shortDate(p.paidAt)}` : `created ${shortDate(p.createdAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"} dot>
                    <span className="inline-flex items-center gap-1">
                      {STATUS_ICON[p.status]}
                      {p.status.toLowerCase()}
                    </span>
                  </Badge>
                  <span className="font-display tabular text-[14px] text-[color:var(--ink)] w-[80px] text-right">
                    {money(p.amount)}
                  </span>
                  {p.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === p.id}
                      onClick={() => pay(p.id)}
                    >
                      Mark paid
                    </Button>
                  )}
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}
        <p className="mt-4 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
          Click and conversion tracking endpoints (<code className="font-mono">/r/[code]</code>)
          and Stripe Connect payouts ship in a future stage.
        </p>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "accent" | "success" | "warn";
}) {
  const color =
    tone === "success"
      ? "#059669"
      : tone === "warn"
        ? "#C89450"
        : tone === "accent"
          ? "var(--accent)"
          : "var(--ink)";
  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between">
        <span className="quiet-caps">{label}</span>
        <span className="text-[color:var(--ink-muted)]">{icon}</span>
      </div>
      <div
        className="font-display tabular text-[24px] mt-1.5 leading-none tracking-[-0.015em]"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
