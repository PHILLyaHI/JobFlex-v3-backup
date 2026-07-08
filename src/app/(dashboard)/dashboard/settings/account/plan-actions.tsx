"use client";
import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { formatPlanPrice, planCtaLabel } from "@/lib/planCatalog";
import { usePlanCheckout } from "@/components/billing/usePlanCheckout";

/** Serializable subset of PlanDTO the dialog needs (passed from server pages). */
export interface PlanOption {
  slug: string;
  name: string;
  priceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number;
  isFree: boolean;
}

export function PlanActions({
  plans,
  currentSlug,
}: {
  plans: PlanOption[];
  currentSlug: string;
}) {
  const { start, pendingSlug } = usePlanCheckout();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string>(
    plans.some((p) => p.slug === currentSlug) ? currentSlug : (plans[0]?.slug ?? ""),
  );
  const [interval, setInterval] = React.useState<"MONTH" | "YEAR">("MONTH");

  const selected = plans.find((p) => p.slug === target) ?? null;
  const yearlyAvailable = !!selected?.yearlyPriceCents;
  const busy = pendingSlug !== null;

  async function apply() {
    if (!selected) return;
    await start(selected, yearlyAvailable ? interval : "MONTH");
    if (selected.isFree) setOpen(false); // paid path redirects to Stripe; free just refreshes
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        icon={<ArrowUpRight className="h-3.5 w-3.5" />}
      >
        Change plan
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Change plan"
        description="Paid plans route through Stripe Checkout. You can apply a promo code on the Stripe page."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onClick={apply} disabled={!selected}>
              {selected ? planCtaLabel(selected.isFree, selected.trialDays) : "Continue"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Target plan" value={target} onChange={(e) => setTarget(e.target.value)}>
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} — {formatPlanPrice(p.priceCents)}
                {p.isFree ? "" : "/mo"}
              </option>
            ))}
          </Select>
          {selected && !selected.isFree && yearlyAvailable && (
            <Select
              label="Billing period"
              value={interval}
              onChange={(e) => setInterval(e.target.value as "MONTH" | "YEAR")}
            >
              <option value="MONTH">Monthly — {formatPlanPrice(selected.priceCents)}/mo</option>
              <option value="YEAR">
                Yearly — {formatPlanPrice(selected.yearlyPriceCents ?? 0)}/yr
              </option>
            </Select>
          )}
          {selected && !selected.isFree && selected.trialDays > 0 && (
            <p className="text-[12px] text-[color:var(--ink-muted)]">
              Starts with a {selected.trialDays}-day free trial — you won&apos;t be charged until it ends.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
