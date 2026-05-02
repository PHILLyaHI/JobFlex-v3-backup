import Link from "next/link";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/format";
import { getMonthlyRollup, getFinancialsRollup } from "@/actions/financials";
import { RevenueExpenseChart } from "@/components/financials/RevenueExpenseChart";
import { ProfitMarginGauge } from "@/components/financials/ProfitMarginGauge";
import { ReceiptDropzone } from "@/components/financials/ReceiptDropzone";

export default async function FinancialsOverview() {
  const { organizationId } = await requireOrg();
  const [rollup, monthly, jobs] = await Promise.all([
    getFinancialsRollup(organizationId),
    getMonthlyRollup(organizationId, 12),
    db.job.findMany({
      where: { organizationId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      select: { id: true, title: true },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);

  return (
    <>
      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Revenue · 30d"
          value={money(rollup.revenue30d)}
          hint="Paid invoices"
        />
        <StatCard
          label="Expenses · 30d"
          value={money(rollup.expenses30d)}
          hint="Job-level"
        />
        <StatCard
          label="Profit · 30d"
          value={money(rollup.profit30d)}
          delta={
            rollup.marginPct !== 0
              ? {
                  value: `${rollup.marginPct.toFixed(1)}%`,
                  direction: rollup.marginPct >= 0 ? "up" : "down",
                }
              : undefined
          }
          hint="Revenue − expenses"
        />
        <StatCard
          label="Pipeline value"
          value={money(rollup.pipelineValue)}
          hint="Open proposals"
        />
      </StaggerGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 mb-6">
        <RevenueExpenseChart data={monthly} />
        <ProfitMarginGauge
          marginPct={rollup.marginPct}
          revenue={rollup.revenue30d}
          expenses={rollup.expenses30d}
          profit={rollup.profit30d}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <ReceiptDropzone jobs={jobs} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Attention</CardTitle>
              <CardSubtitle>What needs you this week.</CardSubtitle>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-700" />
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            <AttentionRow
              label="Invoices pending"
              count={rollup.invoicesPending}
              hint={
                rollup.invoicesOverdue > 0
                  ? `${rollup.invoicesOverdue} overdue`
                  : "all current"
              }
              href="/dashboard/financials/invoices"
              tone={rollup.invoicesOverdue > 0 ? "danger" : "neutral"}
            />
            <AttentionRow
              label="Change orders awaiting"
              count={rollup.changeOrdersPending}
              hint="DRAFT or SENT"
              href="/dashboard/financials/change-orders"
              tone={rollup.changeOrdersPending > 0 ? "accent" : "neutral"}
            />
          </ul>
        </Card>
      </div>
    </>
  );
}

function AttentionRow({
  label,
  count,
  hint,
  href,
  tone,
}: {
  label: string;
  count: number;
  hint: string;
  href: string;
  tone: "neutral" | "accent" | "danger";
}) {
  return (
    <li className="py-3.5 flex items-center justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium text-[color:var(--ink)]">{label}</div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{hint}</div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`font-display tabular text-[20px] tracking-[-0.015em] ${
            tone === "danger"
              ? "text-rose-700"
              : tone === "accent"
                ? "text-[color:var(--accent)]"
                : "text-[color:var(--ink)]"
          }`}
        >
          {count}
        </span>
        <Link href={href as any}>
          <Button variant="ghost" size="sm" icon={<ArrowUpRight className="h-3 w-3" />}>
            Open
          </Button>
        </Link>
      </div>
    </li>
  );
}
