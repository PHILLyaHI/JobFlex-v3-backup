"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, RefreshCw, BadgeCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { upsertPricingPlan, deletePricingPlan } from "@/actions/admin";
import { syncPlanToStripe } from "@/actions/plans";
import { LIMIT_DEFS, type PlanLimits, type LimitKey } from "@/lib/planLimits";

export interface HydratedPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number;
  interval: string;
  order: number;
  features: string[];
  /** Numeric caps keyed by LimitKey; a missing key means unlimited. */
  limits: PlanLimits;
}
export interface SyncedInfo {
  monthly: boolean;
  yearly: boolean;
}

const BLANK: HydratedPlan = {
  id: "",
  slug: "",
  name: "",
  description: "",
  priceCents: 0,
  yearlyPriceCents: null,
  trialDays: 0,
  interval: "month",
  order: 0,
  features: [],
  limits: {},
};

/** Dollars (number) → integer cents, rounded to avoid float drift (29.99 → 2999). */
function dollarsToCents(dollars: number): number {
  return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
}

/** Annual savings vs paying monthly, as a whole percent (0 when no yearly price). */
function yearlySavingsPct(monthlyCents: number, yearlyCents: number | null): number {
  if (!yearlyCents || monthlyCents <= 0) return 0;
  const full = monthlyCents * 12;
  if (yearlyCents >= full) return 0;
  return Math.round(((full - yearlyCents) / full) * 100);
}

export function PlansClient({
  plans,
  synced,
  stripeEnabled,
}: {
  plans: HydratedPlan[];
  synced: Record<string, SyncedInfo>;
  stripeEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<HydratedPlan | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);

  async function save(p: HydratedPlan) {
    try {
      await upsertPricingPlan({
        id: p.id || undefined,
        slug: p.slug,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        yearlyPriceCents: p.yearlyPriceCents,
        trialDays: p.trialDays,
        interval: p.interval as "month" | "year",
        order: p.order,
        features: p.features,
        limits: p.limits,
      });
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error("Save failed", err instanceof Error ? err.message : undefined);
    }
  }

  async function drop(id: string) {
    try {
      await deletePricingPlan(id);
      toast.success("Deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Delete failed", err instanceof Error ? err.message : undefined);
    }
  }

  async function sync(id: string) {
    setSyncingId(id);
    try {
      await syncPlanToStripe(id);
      toast.success("Synced to Stripe", "Stripe Products and Prices are up to date.");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Sync failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pricing plans</CardTitle>
            <CardSubtitle>{plans.length} plan{plans.length === 1 ? "" : "s"}</CardSubtitle>
          </div>
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing({ ...BLANK })}>
            New plan
          </Button>
        </CardHeader>
        {plans.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No plans yet. Create one.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {plans.map((p) => {
              const savings = yearlySavingsPct(p.priceCents, p.yearlyPriceCents);
              const sx = synced[p.slug];
              const isSynced = !!sx && sx.monthly;
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[color:var(--ink)]">{p.name}</span>
                      <span className="text-[11px] text-[color:var(--ink-faint)] font-mono">{p.slug}</span>
                      {isSynced ? (
                        <Badge tone="success" dot>synced</Badge>
                      ) : (
                        <Badge tone="neutral">not synced</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {money(p.priceCents / 100)}/mo
                      {p.yearlyPriceCents ? (
                        <>
                          {" · "}
                          {money(p.yearlyPriceCents / 100)}/yr
                          {savings > 0 && <span className="text-[color:var(--accent-ink)]"> · save {savings}%</span>}
                        </>
                      ) : null}
                      {p.trialDays > 0 && <> · {p.trialDays}-day trial</>}
                    </div>
                    {p.features.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.features.slice(0, 6).map((f) => (
                          <Badge key={f} tone="neutral">{f}</Badge>
                        ))}
                        {p.features.length > 6 && (
                          <span className="text-[10px] text-[color:var(--ink-faint)]">+{p.features.length - 6}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={syncingId === p.id}
                    disabled={!stripeEnabled}
                    icon={isSynced ? <RefreshCw className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                    onClick={() => sync(p.id)}
                    title={stripeEnabled ? "Create/update Stripe Product & Prices" : "Connect Stripe first"}
                  >
                    {isSynced ? "Re-sync" : "Sync to Stripe"}
                  </Button>
                  <button
                    onClick={() => setEditing(p)}
                    className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                    aria-label="Edit plan"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => drop(p.id)}
                    className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Delete plan"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!stripeEnabled && (
          <p className="mt-4 text-[11px] text-[color:var(--ink-muted)]">
            Stripe isn&apos;t configured — set <span className="font-mono">STRIPE_SECRET_KEY</span> to enable syncing and checkout.
          </p>
        )}
      </Card>

      <PlanSheet editing={editing} onClose={() => setEditing(null)} onSave={save} />
    </>
  );
}

function PlanSheet({
  editing,
  onClose,
  onSave,
}: {
  editing: HydratedPlan | null;
  onClose: () => void;
  onSave: (p: HydratedPlan) => Promise<void>;
}) {
  const [local, setLocal] = React.useState<HydratedPlan>(editing ?? BLANK);
  const [featuresText, setFeaturesText] = React.useState("");
  // Prices are edited as raw text (dollars) so partially-typed decimals like
  // "29." survive keystrokes; cents are derived into `local` on each change.
  const [priceText, setPriceText] = React.useState("");
  const [yearlyText, setYearlyText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate sheet fields when a plan is opened */
  React.useEffect(() => {
    if (editing) {
      setLocal(editing);
      setFeaturesText(editing.features.join("\n"));
      setPriceText(editing.priceCents ? String(editing.priceCents / 100) : "");
      setYearlyText(editing.yearlyPriceCents != null ? String(editing.yearlyPriceCents / 100) : "");
    }
  }, [editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const savings = yearlySavingsPct(local.priceCents, local.yearlyPriceCents);

  // Empty input → remove the key (unlimited); a number → a non-negative cap.
  function setLimit(key: LimitKey, raw: string) {
    setLocal((prev) => {
      const next: PlanLimits = { ...prev.limits };
      if (raw.trim() === "") {
        delete next[key];
      } else {
        const n = Math.max(0, Math.trunc(Number(raw)));
        if (Number.isFinite(n)) next[key] = n;
      }
      return { ...prev, limits: next };
    });
  }

  async function submit() {
    setBusy(true);
    try {
      await onSave({
        ...local,
        features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!editing}
      onClose={onClose}
      title={editing?.id ? "Edit plan" : "New plan"}
      description="Set pricing, trial, and the yearly option. Sync to Stripe afterward to enable checkout."
      width="min(520px, 100vw)"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={submit}>Save</Button>
        </div>
      }
    >
      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Name" value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
            <Input label="Slug" value={local.slug} onChange={(e) => setLocal({ ...local, slug: e.target.value })} />
          </div>
          <Textarea
            label="Description"
            rows={2}
            value={local.description ?? ""}
            onChange={(e) => setLocal({ ...local, description: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Monthly ($)"
              type="text"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => {
                setPriceText(e.target.value);
                setLocal((p) => ({ ...p, priceCents: dollarsToCents(Number(e.target.value || 0)) }));
              }}
              hint="USD / month"
            />
            <Input
              label="Yearly ($)"
              type="text"
              inputMode="decimal"
              value={yearlyText}
              onChange={(e) => {
                const v = e.target.value;
                setYearlyText(v);
                setLocal((p) => ({
                  ...p,
                  yearlyPriceCents: v.trim() === "" ? null : dollarsToCents(Number(v)),
                }));
              }}
              hint={savings > 0 ? `Saves ${savings}%` : "Optional"}
            />
            <Input
              label="Trial (days)"
              type="number"
              min={0}
              value={local.trialDays}
              onChange={(e) => setLocal({ ...local, trialDays: Number(e.target.value) })}
            />
          </div>
          <Input
            label="Order"
            type="number"
            value={local.order}
            onChange={(e) => setLocal({ ...local, order: Number(e.target.value) })}
            hint="Sort position on the pricing page (low = first)"
          />

          <div className="pt-1.5 border-t border-[color:var(--ink-line)]">
            <div className="quiet-caps mt-3 mb-1">Plan limits</div>
            <p className="text-[11px] text-[color:var(--ink-muted)] mb-3 leading-relaxed">
              Leave a field blank for <strong>unlimited</strong>. &ldquo;Per cycle&rdquo; limits reset each billing
              period; &ldquo;total&rdquo; limits count the org&rsquo;s lifetime.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {LIMIT_DEFS.map((def) => (
                <Input
                  key={def.key}
                  label={def.label}
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Unlimited"
                  value={local.limits[def.key] ?? ""}
                  onChange={(e) => setLimit(def.key, e.target.value)}
                  hint={def.scope === "monthly" ? "per cycle" : "total"}
                />
              ))}
            </div>
          </div>

          <Textarea
            label="Features (one per line)"
            rows={6}
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            placeholder={"Unlimited proposals\nAI drafts\n5 team seats"}
          />
        </div>
      )}
    </Sheet>
  );
}
