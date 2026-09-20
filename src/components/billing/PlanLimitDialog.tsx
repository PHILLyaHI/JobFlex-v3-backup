"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { usePlanLimitStore } from "@/stores/usePlanLimitStore";
import { LIMIT_DEFS } from "@/lib/planLimits";
import { ConfirmPlanChange } from "./ConfirmPlanChange";

/**
 * Globally-mounted "you've hit your plan limit" dialog. Opened via
 * reportPlanLimit() from create flows.
 *
 * Since 2026-09-19 it is the plan dialog (ConfirmPlanChange) with the limit
 * as its body: one box, one pair of buttons, one stylesheet for the upgrade,
 * the downgrade and this gate, so they cannot drift apart again. The primary
 * button leads to the plans page, where the real comparison is made.
 */
export function PlanLimitDialog() {
  const router = useRouter();
  const open = usePlanLimitStore((s) => s.open);
  const resource = usePlanLimitStore((s) => s.resource);
  const close = usePlanLimitStore((s) => s.close);

  const def = resource ? LIMIT_DEFS.find((d) => d.key === resource) : null;
  const label = def?.label.toLowerCase() ?? null;
  const absolute = def?.scope === "absolute";

  return (
    <ConfirmPlanChange
      open={open}
      kicker="Plan limit"
      title={label ? `No ${label} left` : "Plan limit reached"}
      confirmLabel="See plans"
      onCancel={close}
      onConfirm={() => {
        close();
        router.push("/dashboard/upgrade");
      }}
      body={
        <>
          <p>
            {label ? (
              <>
                You&rsquo;ve used all the <b>{label}</b> included in your plan.{" "}
              </>
            ) : (
              <>You&rsquo;ve hit a limit on your current plan. </>
            )}
            {absolute ? "Upgrade to add more." : "Upgrade to keep going now, or wait until the limit resets next cycle."}
          </p>
          {def ? (
            <div className="jf-confirm-meter">
              <span>{def.label}</span>
              <span>{absolute ? "Seats full" : "0 left this cycle"}</span>
            </div>
          ) : null}
        </>
      }
    />
  );
}
