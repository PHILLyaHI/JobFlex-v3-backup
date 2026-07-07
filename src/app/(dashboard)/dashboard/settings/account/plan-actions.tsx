"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { setOrgPlan } from "@/actions/billing";
import { formatPlanPrice } from "@/lib/planCatalog";

/** Serializable subset of PlanDTO the dialog needs (passed from server pages). */
export interface PlanOption {
  slug: string;
  name: string;
  priceCents: number;
  yearlyPriceCents: number | null;
  isFree: boolean;
}

export function PlanActions({
  plans,
  currentSlug,
}: {
  plans: PlanOption[];
  currentSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string>(
    plans.some((p) => p.slug === currentSlug) ? currentSlug : (plans[0]?.slug ?? ""),
  );
  const [interval, setInterval] = React.useState<"MONTH" | "YEAR">("MONTH");
  const [busy, setBusy] = React.useState(false);

  const selected = plans.find((p) => p.slug === target) ?? null;
  const yearlyAvailable = !!selected?.yearlyPriceCents;

  async function apply() {
    if (!selected) return;
    setBusy(true);
    try {
      // Free plan stays a direct DB change (no Stripe checkout needed).
      if (selected.isFree) {
        await setOrgPlan(selected.slug);
        toast.success(`Switched to ${selected.name}`);
        setOpen(false);
        router.refresh();
        return;
      }

      // Paid plan → real Stripe subscription checkout.
      const res = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planSlug: selected.slug,
          interval: yearlyAvailable ? interval : "MONTH",
        }),
      });

      if (res.ok) {
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }

      if (res.status === 503) {
        // Stripe not configured — fall back to the demo direct-set so dev works.
        await setOrgPlan(selected.slug);
        toast.success(`Switched to ${selected.name}`, "Demo mode — Stripe isn't configured.");
        setOpen(false);
        router.refresh();
        return;
      }

      const { error } = await res.json().catch(() => ({ error: "Checkout failed." }));
      toast.error("Couldn't start checkout", error ?? "This plan isn't checkout-ready yet.");
    } catch (err: unknown) {
      toast.error("Couldn't switch", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
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
              {selected?.isFree ? "Apply" : "Continue to checkout"}
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
        </div>
      </Dialog>
    </>
  );
}
