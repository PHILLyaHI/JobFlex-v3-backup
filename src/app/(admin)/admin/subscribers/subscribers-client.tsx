"use client";
import * as React from "react";
import { Search, SlidersHorizontal, X, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { money, longDate } from "@/lib/format";
import { useSubscriberFilterStore } from "@/stores/useSubscriberFilterStore";
import { getSubscriberStripeStatus } from "@/actions/subscribers";
import type { BillingMetrics } from "@/actions/subscribers";

interface Row {
  id: string;
  source: "stripe" | "local";
  organizationId: string | null;
  orgName: string;
  ownerEmail: string | null;
  customerEmail: string | null;
  plan: string;
  status: string;
  paid: boolean;
  matchedBy: "id" | "email" | "none";
  stripeBacked: boolean;
  externalSubId: string | null;
  stripeCustomerId: string | null;
  amountCents: number;
  promoCode: string | null;
  influencerName: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, "success" | "info" | "warn" | "neutral" | "danger"> = {
  ACTIVE: "success",
  TRIALING: "info",
  PAST_DUE: "warn",
  UNPAID: "danger",
  INCOMPLETE: "warn",
  INCOMPLETE_EXPIRED: "neutral",
  PAUSED: "neutral",
  CANCELED: "neutral",
  EXPIRED: "neutral",
  FREE: "neutral",
};

function statusLabel(s: string) {
  return s.replace("_", " ").toLowerCase();
}

export function SubscribersClient({
  rows,
  metrics,
  stripeLive,
  truncated,
}: {
  rows: Row[];
  metrics: BillingMetrics;
  stripeLive: boolean;
  truncated: boolean;
}) {
  const query = useSubscriberFilterStore((s) => s.query);
  const setQuery = useSubscriberFilterStore((s) => s.setQuery);
  const plan = useSubscriberFilterStore((s) => s.plan);
  const status = useSubscriberFilterStore((s) => s.status);
  const promoCode = useSubscriberFilterStore((s) => s.promoCode);

  const [selected, setSelected] = React.useState<Row | null>(null);

  const plans = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.plan))).sort(),
    [rows],
  );
  const statuses = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );
  const promos = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.promoCode).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (plan && r.plan !== plan) return false;
      if (status && r.status !== status) return false;
      if (promoCode && r.promoCode !== promoCode) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        r.orgName.toLowerCase().includes(q) ||
        (r.ownerEmail ?? "").toLowerCase().includes(q) ||
        (r.customerEmail ?? "").toLowerCase().includes(q) ||
        (r.promoCode ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, plan, status, promoCode]);

  const columns: Column<Row>[] = [
    {
      key: "org",
      header: "Subscriber",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-[color:var(--ink)] truncate">{r.orgName}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] truncate">{r.ownerEmail ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      render: (r) => <Badge tone={r.plan === "NONE" ? "neutral" : "accent"}>{r.plan.toLowerCase()}</Badge>,
    },
    {
      key: "amount",
      header: "Monthly",
      render: (r) =>
        r.amountCents > 0 ? (
          <span className="tabular text-[12px] text-[color:var(--ink-soft)]">{money(r.amountCents / 100)}</span>
        ) : (
          <span className="text-[color:var(--ink-faint)]">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{statusLabel(r.status)}</Badge>
          {r.paid && <BadgeCheck className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-label="Paid" />}
        </span>
      ),
    },
    {
      key: "promo",
      header: "Promo code",
      render: (r) =>
        r.promoCode ? (
          <span className="font-mono text-[12px] text-[color:var(--ink-soft)]">{r.promoCode}</span>
        ) : (
          <span className="text-[color:var(--ink-faint)]">—</span>
        ),
    },
  ];

  return (
    <>
      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="MRR" value={money(metrics.mrrCents / 100)} accent hint={stripeLive ? "Live from Stripe" : "From cached mirror"} />
        <StatCard label="Paying subscribers" value={String(metrics.payingCount)} hint="Active or trialing" />
        <StatCard
          label="Didn’t pay"
          value={String(metrics.notPaidCount)}
          hint={
            metrics.canceledCount > 0
              ? `Past due / unpaid · ${metrics.canceledCount} canceled`
              : "Past due / unpaid / incomplete"
          }
        />
        <StatCard
          label="Used a promo code"
          value={String(metrics.promoTotal)}
          hint={metrics.promoUsage.slice(0, 3).map((p) => `${p.code} ×${p.count}`).join(" · ") || "None yet"}
        />
      </StaggerGrid>

      {truncated && (
        <div className="mb-5 rounded-[var(--r-md)] hairline bg-[color:var(--paper-deep)] px-3.5 py-2.5 text-[12px] text-[color:var(--ink-soft)]">
          Showing the first 2,000 Stripe subscriptions — the metrics above are partial.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="w-full md:w-auto md:min-w-[320px]">
          <Input
            placeholder="Search by org, email, or promo code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <SubscriberFilter plans={plans} statuses={statuses} promos={promos} />
        <div className="ml-auto text-[11px] text-[color:var(--ink-muted)] tabular">
          {filtered.length} / {rows.length} subscribers
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => setSelected(r)}
        empty={
          <EmptyState
            title="No subscribers match"
            description="Adjust the filters, or wait for the first Stripe-confirmed subscription to land."
          />
        }
      />

      <SubscriberSheet row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SubscriberFilter({
  plans,
  statuses,
  promos,
}: {
  plans: string[];
  statuses: string[];
  promos: string[];
}) {
  const plan = useSubscriberFilterStore((s) => s.plan);
  const setPlan = useSubscriberFilterStore((s) => s.setPlan);
  const status = useSubscriberFilterStore((s) => s.status);
  const setStatus = useSubscriberFilterStore((s) => s.setStatus);
  const promoCode = useSubscriberFilterStore((s) => s.promoCode);
  const setPromoCode = useSubscriberFilterStore((s) => s.setPromoCode);
  const reset = useSubscriberFilterStore((s) => s.reset);

  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = (plan ? 1 : 0) + (status ? 1 : 0) + (promoCode ? 1 : 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((x) => !x)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium transition-all",
          activeCount > 0 || open
            ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
            : "text-[color:var(--ink-soft)] hairline hover:bg-black/[0.04]",
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 opacity-80" />
        Filters
        {activeCount > 0 && (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white/20 px-1 text-[10px] tabular">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-30 w-[300px] paper-card !p-0 shadow-pop overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="quiet-caps !mb-0">Filter subscribers</span>
            {activeCount > 0 && (
              <button
                onClick={reset}
                className="text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
              >
                Reset
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-4 space-y-4">
            <FilterGroup label="Plan">
              {plans.map((p) => (
                <Chip key={p} active={plan === p} onClick={() => setPlan(plan === p ? undefined : p)}>
                  {p.toLowerCase()}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Status">
              {statuses.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? undefined : s)}>
                  {statusLabel(s)}
                </Chip>
              ))}
            </FilterGroup>
            {promos.length > 0 && (
              <FilterGroup label="Promo code">
                {promos.map((c) => (
                  <Chip key={c} active={promoCode === c} onClick={() => setPromoCode(promoCode === c ? undefined : c)}>
                    {c}
                  </Chip>
                ))}
              </FilterGroup>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="quiet-caps mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors",
        active
          ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
          : "text-[color:var(--ink-muted)] hairline hover:bg-black/[0.04]",
      )}
    >
      {active && <X className="h-3 w-3 opacity-70" />}
      {children}
    </button>
  );
}

function SubscriberSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [live, setLive] = React.useState<Awaited<ReturnType<typeof getSubscriberStripeStatus>> | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // Fetch-on-prop-change: reset + load live Stripe status when the row changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(null);
    if (!row?.externalSubId) return;
    let cancelled = false;
    setLoading(true);
    getSubscriberStripeStatus(row.externalSubId)
      .then((r) => !cancelled && setLive(r))
      .catch(() => !cancelled && setLive(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [row?.externalSubId]);

  return (
    <Sheet open={!!row} onClose={onClose} title={row?.orgName} description="Subscription detail" width="min(460px, 100vw)">
      {row && (
        <dl className="space-y-3 text-[13px]">
          <Field label="Owner email" value={row.ownerEmail ?? "—"} />
          <Field label="Stripe customer" value={row.customerEmail ?? "—"} />
          <Field label="Plan" value={row.plan.toLowerCase()} />
          <Field label="Status" value={statusLabel(row.status)} />
          <Field label="Monthly" value={row.amountCents > 0 ? money(row.amountCents / 100) : "—"} />
          <Field label="Promo code" value={row.promoCode ?? "—"} />
          <Field label="Referred by" value={row.influencerName ?? "—"} />
          <Field label="Renews" value={row.currentPeriodEnd ? longDate(row.currentPeriodEnd) : "—"} />
          <Field label="Subscription started" value={longDate(row.createdAt)} />
          {row.matchedBy === "email" && (
            <p className="text-[11px] text-[color:var(--ink-muted)] pt-1">
              Linked to this org by matching email — unverified.
            </p>
          )}
          {row.matchedBy === "none" && (
            <p className="text-[11px] text-[color:var(--ink-muted)] pt-1">
              No matching JobFlex org — this Stripe customer isn’t linked to an account.
            </p>
          )}
          <div className="pt-3 border-t border-[color:var(--ink-line)]">
            <div className="quiet-caps mb-1.5">Live Stripe check</div>
            {!row.externalSubId ? (
              <p className="text-[12px] text-[color:var(--ink-muted)]">Not backed by a Stripe subscription.</p>
            ) : loading ? (
              <p className="text-[12px] text-[color:var(--ink-muted)]">Checking Stripe…</p>
            ) : live ? (
              <div className="space-y-1.5">
                <Field label="Stripe status" value={live.status} />
                <Field label="Cancels at period end" value={live.cancelAtPeriodEnd ? "yes" : "no"} />
                <Field label="Applied promo" value={live.promotionCode ?? "—"} />
              </div>
            ) : (
              <p className="text-[12px] text-[color:var(--ink-muted)]">
                Stripe is not configured, so live verification is unavailable — showing the cached mirror.
              </p>
            )}
          </div>
        </dl>
      )}
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[color:var(--ink-muted)]">{label}</dt>
      <dd className="text-[color:var(--ink)] text-right">{value}</dd>
    </div>
  );
}
