"use client";

// "The Well-Kept Ledger" — tier-tinted subscription view (live).
//
// Each plan tier owns a tone (Free→graphite, Starter→sage, Professional→emerald,
// Enterprise→amber); the current plan's tone floods a bold identity hero, and a
// single segmented "spectrum" widget shows where you sit. Everything else is
// tinted-neutral with hairline structure. All tonal shades derive from the
// locked tokens via color-mix (no new primitives); tints use color-mix, never
// `bg-[var(--token)]/NN` (broken project-wide).
//
// Composition note: the hero carries identity only — no nested card, no gray on
// colour. Usage + the change-plan action live on a sibling light card so the
// dark-text PlanActions button keeps its contrast.

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Sparkles, CreditCard, ScrollText, Gift, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { PlanActions } from "@/app/(dashboard)/dashboard/settings/account/plan-actions";
import { ReferralHeroCard } from "@/components/referrals/ReferralHeroCard";
import { PlanFeatureMatrix } from "@/components/billing/PlanFeatureMatrix";
import { Button } from "@/components/ui/Button";
import { usePlanCheckout } from "@/components/billing/usePlanCheckout";
import { money, longDate } from "@/lib/format";
import { formatPlanPrice, priceCadence, planCtaLabel, type PlanDTO } from "@/lib/planCatalog";
import type { SubscriptionInvoice } from "@/actions/billing";

type Tone = "success" | "warn" | "danger" | "accent" | "neutral";

interface TierStyle {
  /** Bright tone for the spectrum + glows. */
  bar: string;
  /** Deep, derived-from-token shade used as the readable hero base. */
  deep: string;
}

// Tones are positional now that plans come from the DB catalog: free plans get
// graphite, paid plans cycle sage → emerald → amber by catalog order — the
// original four-tier look is preserved and new plans slot in sensibly.
const FREE_TONE: TierStyle = { bar: "var(--ink-muted)", deep: "var(--ink)" };
const PAID_TONES: TierStyle[] = [
  { bar: "var(--accent)", deep: "var(--accent-ink)" },
  { bar: "var(--emerald)", deep: "color-mix(in srgb, var(--emerald), var(--ink) 58%)" },
  { bar: "var(--amber)", deep: "color-mix(in srgb, var(--amber), var(--ink) 55%)" },
];

function toneForPlan(plans: PlanDTO[], slug: string): TierStyle {
  const paid = plans.filter((p) => !p.isFree);
  const idx = paid.findIndex((p) => p.slug === slug);
  if (idx >= 0) return PAID_TONES[idx % PAID_TONES.length];
  return FREE_TONE; // free plan, or a slug no longer in the catalog
}

const PROBLEM_STATUSES = ["PAST_DUE", "CANCELED", "EXPIRED"];

function invoiceTone(s: string | null): Tone {
  switch (s) {
    case "paid":
      return "success";
    case "open":
      return "warn";
    case "void":
    case "uncollectible":
      return "danger";
    default:
      return "neutral";
  }
}

/** One enforced-limit row from the limits engine (finite caps only). */
export interface UsageRow {
  resource: string;
  label: string;
  used: number;
  limit: number;
}

export interface SubscriptionViewProps {
  /** Display name of the current plan (catalog name, or title-cased orphan slug). */
  planName: string;
  /** Monthly price of the current plan; null when the slug left the catalog. */
  priceCents: number | null;
  isFree: boolean;
  /** Lowercase slug used to mark "current" in the spectrum + matrix. */
  currentSlug: string;
  /** Active catalog plans, display-ordered. */
  plans: PlanDTO[];
  status: string;
  nextBill: string | null;
  trialEndsAt: string | null;
  /** The limits engine's enforced caps for this org (unlimited keys omitted). */
  usage: UsageRow[];
  invoices: { available: boolean; invoices: SubscriptionInvoice[] };
  referral: {
    code: string;
    shareUrl: string;
    rewardSummary: string;
    uses: number;
    converted: number;
    pending: number;
  };
}

export function SubscriptionView({
  planName,
  priceCents,
  isFree,
  currentSlug,
  plans,
  status,
  nextBill,
  trialEndsAt,
  usage,
  invoices,
  referral,
}: SubscriptionViewProps) {
  const reduce = useReducedMotion();
  const { start, pendingSlug } = usePlanCheckout();

  const ease = [0.22, 1, 0.36, 1] as [number, number, number, number];
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: reduce ? 0 : 0.04 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 16 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.5, ease } },
  };

  const tier = toneForPlan(plans, currentSlug);
  const isTrial = status === "TRIALING";
  const isProblem = PROBLEM_STATUSES.includes(status);

  const billLine = isTrial
    ? trialEndsAt
      ? `Trial ends · ${longDate(trialEndsAt)}`
      : "On trial"
    : nextBill
      ? `Next bill · ${longDate(nextBill)}`
      : "No upcoming charges";

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="Account"
          title="Subscription"
          description="See your plan, billing, and rewards in one place."
        />
      </motion.div>

      {/* ── Tone-flooded identity hero ──────────────────────────────── */}
      <motion.section
        variants={item}
        className="relative overflow-hidden rounded-[var(--r-lg)] shadow-[var(--shadow-md)]"
        style={{ backgroundColor: tier.deep }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(120% 120% at 88% -20%, color-mix(in srgb, ${tier.bar} 60%, transparent) 0%, transparent 55%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 4% 118%, rgba(255,255,255,0.10), transparent 50%)" }}
        />

        <div className="relative p-8 text-white md:p-10">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/65">Your plan</span>
            {isProblem ? (
              <span
                className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                style={{ color: "color-mix(in srgb, var(--rose) 86%, var(--ink))" }}
              >
                {status.replace("_", " ").toLowerCase()}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-[11px] font-medium capitalize text-white">
                {status.replace("_", " ").toLowerCase()}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-end gap-3">
            <h1 className="font-display text-[clamp(44px,6vw,60px)] leading-[0.92] tracking-[-0.025em] text-white">
              {planName}
            </h1>
            <Sparkles className="mb-3 h-5 w-5 text-white/70" aria-hidden />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <span className="flex items-baseline gap-1.5">
              <span className="stat-numeric text-[22px] text-white">
                {priceCents !== null ? formatPlanPrice(priceCents) : "—"}
              </span>
              {priceCents !== null && (
                <span className="text-white/65">{priceCadence(isFree, true)}</span>
              )}
            </span>
            <span aria-hidden className="h-3.5 w-px bg-white/20" />
            <span className="tabular text-white/80">{billLine}</span>
          </div>
        </div>
      </motion.section>

      {/* ── Tier spectrum: one segmented widget, not a card grid ────── */}
      <motion.section variants={item}>
        <div className="quiet-caps mb-3">Where you are</div>
        <div className="paper-card overflow-hidden p-0">
          <div className="grid grid-cols-2 gap-px bg-[color:var(--ink-line)] sm:grid-cols-4">
            {plans.map((p) => {
              const t = toneForPlan(plans, p.slug);
              const current = p.slug === currentSlug;
              return (
                <div
                  key={p.slug}
                  className="relative bg-white p-4 sm:p-5"
                  style={current ? { background: `color-mix(in srgb, ${t.bar} 8%, white)` } : undefined}
                >
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.bar }} />
                  <div
                    className="font-display text-[15px] tracking-[-0.01em]"
                    style={{ color: current ? t.deep : "var(--ink)" }}
                  >
                    {p.name}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="stat-numeric text-[18px]">{formatPlanPrice(p.priceCents)}</span>
                    <span className="text-[10px] text-[color:var(--ink-muted)]">
                      {priceCadence(p.isFree, true)}
                    </span>
                  </div>
                  {current ? (
                    <div
                      className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: t.deep }}
                    >
                      Current plan
                    </div>
                  ) : (
                    <Button
                      variant={p.highlight ? "primary" : "outline"}
                      size="sm"
                      className="mt-3 w-full"
                      loading={pendingSlug === p.slug}
                      disabled={pendingSlug !== null}
                      onClick={() => start(p)}
                    >
                      {planCtaLabel(p.isFree, p.trialDays)}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* ── Usage + plan management (light surface for dark-text CTA) ─ */}
      <motion.section variants={item}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Usage</CardTitle>
              <CardSubtitle>Your plan&apos;s enforced limits · reset each billing cycle</CardSubtitle>
            </div>
            <PlanActions plans={plans} currentSlug={currentSlug} />
          </CardHeader>
          {usage.length === 0 ? (
            <p className="text-[12.5px] text-[color:var(--ink-soft)]">
              Everything on your plan is unlimited.
            </p>
          ) : (
            <div className="space-y-4">
              {usage.map((u) => (
                <UsageBar key={u.resource} label={u.label} used={u.used} limit={u.limit} />
              ))}
            </div>
          )}
          <p className="mt-4 text-[11.5px] text-[color:var(--ink-muted)]">
            Hitting a limit prompts an upgrade; it never blocks your existing work.
          </p>
        </Card>
      </motion.section>

      {/* ── Billing history (real Stripe invoices) ──────────────────── */}
      <motion.section variants={item}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Billing history</CardTitle>
              <CardSubtitle>Your subscription invoices.</CardSubtitle>
            </div>
            <ScrollText className="h-4 w-4 text-[color:var(--ink-muted)]" aria-hidden />
          </CardHeader>
          <InvoiceList data={invoices} />
        </Card>
      </motion.section>

      {/* ── Referrals ───────────────────────────────────────────────── */}
      <motion.section variants={item}>
        <div className="mb-4 flex items-center gap-2">
          <Gift className="h-4 w-4" style={{ color: "var(--emerald)" }} aria-hidden />
          <div className="quiet-caps" style={{ color: "var(--emerald)" }}>
            Rewards
          </div>
        </div>
        <h2 className="mb-4 font-display text-[22px] tracking-[-0.015em]">Refer &amp; earn</h2>
        <ReferralHeroCard code={referral.code} shareUrl={referral.shareUrl} rewardSummary={referral.rewardSummary} />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Code uses" value={String(referral.uses)} />
          <StatCard label="Converted signups" value={String(referral.converted)} />
          <StatCard label="Pending" value={String(referral.pending)} />
        </div>
      </motion.section>

      {/* ── Compare all plans ───────────────────────────────────────── */}
      <motion.section variants={item}>
        <div className="quiet-caps mb-1">Plans</div>
        <h2 className="mb-5 font-display text-[22px] tracking-[-0.015em]">Compare all plans</h2>
        <PlanFeatureMatrix plans={plans} currentSlug={currentSlug} />
      </motion.section>
    </motion.div>
  );
}

/* ── Usage meter (semantic colour by load) ──────────────────────────── */
function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100);
  const tone = pct >= 90 ? "var(--rose)" : pct >= 60 ? "var(--amber)" : "var(--accent)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-[color:var(--ink-soft)]">{label}</span>
        <span className="tabular text-[color:var(--ink-muted)]">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.05]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
    </div>
  );
}

/* ── Invoice list with honest empty states ──────────────────────────── */
function InvoiceList({ data }: { data: { available: boolean; invoices: SubscriptionInvoice[] } }) {
  if (!data.available) {
    return (
      <div className="py-10 text-center">
        <CreditCard className="mx-auto mb-2 h-5 w-5 text-[color:var(--ink-faint)]" aria-hidden />
        <p className="text-[12.5px] font-medium text-[color:var(--ink-soft)]">No billing history yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[color:var(--ink-muted)]">
          Invoices appear here once Stripe subscription billing is active for your account.
        </p>
      </div>
    );
  }

  if (data.invoices.length === 0) {
    return (
      <div className="py-10 text-center text-[12px] text-[color:var(--ink-muted)]">
        <CreditCard className="mx-auto mb-2 h-5 w-5 opacity-50" aria-hidden />
        No invoices yet.
      </div>
    );
  }

  return (
    <>
      <div className="mb-1 hidden grid-cols-[1fr_120px_110px_110px] gap-3 border-b border-[color:var(--ink-line)] px-1 pb-2 md:grid">
        <div className="quiet-caps">Invoice</div>
        <div className="quiet-caps">Date</div>
        <div className="quiet-caps">Status</div>
        <div className="quiet-caps text-right">Amount</div>
      </div>
      <ul className="divide-y divide-[color:var(--ink-line)]">
        {data.invoices.map((inv) => {
          const link = inv.hostedInvoiceUrl ?? inv.invoicePdf;
          return (
            <li
              key={inv.id}
              className="grid grid-cols-1 items-center gap-2 py-3 md:grid-cols-[1fr_120px_110px_110px] md:gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-medium tabular text-[color:var(--ink)]">
                  {inv.number ?? "Invoice"}
                </span>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded text-[11px] text-[color:var(--accent)] hover:text-[color:var(--accent-ink)] focus-ring"
                  >
                    {inv.invoicePdf ? <FileText className="h-3 w-3" aria-hidden /> : <ExternalLink className="h-3 w-3" aria-hidden />}
                    View
                  </a>
                )}
              </div>
              <div className="text-[12px] tabular text-[color:var(--ink-muted)]">
                {longDate(new Date(inv.created * 1000))}
              </div>
              <div>
                <Badge tone={invoiceTone(inv.status)}>{inv.status ?? "—"}</Badge>
              </div>
              <span className="font-display text-[15px] tabular md:text-right">
                {money(inv.amountPaidCents / 100, inv.currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
