"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { setOrgPlan } from "@/actions/billing";
import { PLAN_TIERS, type Plan } from "@/lib/entitlements";

export function PlanActions({ currentPlan }: { currentPlan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<Plan>(currentPlan);
  const [interval, setInterval] = React.useState<"MONTH" | "YEAR">("MONTH");
  const [busy, setBusy] = React.useState(false);

  async function apply() {
    setBusy(true);
    try {
      // Downgrade to FREE stays a direct DB change (no Stripe checkout needed).
      if (target === "FREE") {
        await setOrgPlan("FREE");
        toast.success("Switched to free");
        setOpen(false);
        router.refresh();
        return;
      }

      // Paid plan → real Stripe subscription checkout.
      const res = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: target.toLowerCase(), interval }),
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
        await setOrgPlan(target);
        toast.success(`Switched to ${target.toLowerCase()}`, "Demo mode — Stripe isn't configured.");
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
            <Button loading={busy} onClick={apply}>
              {target === "FREE" ? "Apply" : "Continue to checkout"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Target plan" value={target} onChange={(e) => setTarget(e.target.value as Plan)}>
            {PLAN_TIERS.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase()}
              </option>
            ))}
          </Select>
          {target !== "FREE" && (
            <Select label="Billing period" value={interval} onChange={(e) => setInterval(e.target.value as "MONTH" | "YEAR")}>
              <option value="MONTH">Monthly</option>
              <option value="YEAR">Yearly</option>
            </Select>
          )}
        </div>
      </Dialog>
    </>
  );
}
