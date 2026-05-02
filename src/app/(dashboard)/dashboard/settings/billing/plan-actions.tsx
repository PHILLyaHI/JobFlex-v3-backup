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
  const [busy, setBusy] = React.useState(false);

  async function apply() {
    setBusy(true);
    try {
      await setOrgPlan(target);
      toast.success(`Switched to ${target.toLowerCase()}`);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't switch", err?.message);
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
        description="Demo mode — this updates the Subscription record directly. Production will route through Stripe Checkout."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={apply}>
              Apply
            </Button>
          </>
        }
      >
        <Select
          label="Target plan"
          value={target}
          onChange={(e) => setTarget(e.target.value as Plan)}
        >
          {PLAN_TIERS.map((p) => (
            <option key={p} value={p}>
              {p.toLowerCase()}
            </option>
          ))}
        </Select>
      </Dialog>
    </>
  );
}
