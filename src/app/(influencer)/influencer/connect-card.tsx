"use client";
import * as React from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { createConnectOnboardingLink } from "@/actions/connect";

export function ConnectCard({ status }: { status: string }) {
  const [busy, setBusy] = React.useState(false);

  async function onboard() {
    setBusy(true);
    try {
      const { url } = await createConnectOnboardingLink();
      window.location.href = url;
    } catch (err: unknown) {
      toast.error("Couldn't start onboarding", err instanceof Error ? err.message : undefined);
      setBusy(false);
    }
  }

  const started = status === "ONBOARDING" || status === "RESTRICTED";

  return (
    <div className="paper-card p-5 flex items-start gap-4 border-l-[3px] border-l-[color:var(--accent)]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
        <Landmark className="h-4.5 w-4.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[color:var(--ink)]">
          {started ? "Finish setting up payouts" : "Set up payouts"}
        </div>
        <p className="text-[12px] text-[color:var(--ink-muted)] mt-0.5 max-w-prose">
          Connect a Stripe account to receive your commission. You can earn before connecting, but
          we can only pay you out once this is complete.
        </p>
      </div>
      <Button loading={busy} onClick={onboard}>
        {started ? "Continue" : "Connect Stripe"}
      </Button>
    </div>
  );
}
