"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { requestPayout } from "@/actions/influencers";

export function RequestPayoutButton({
  disabled,
  reason,
}: {
  disabled: boolean;
  reason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      await requestPayout();
      toast.success("Payout requested", "An admin will review and release it to your Stripe account.");
      router.refresh();
    } catch (err: unknown) {
      toast.error("Couldn't request payout", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button icon={<Wallet className="h-3.5 w-3.5" />} loading={busy} disabled={disabled} onClick={submit}>
        Request payout
      </Button>
      {reason && <span className="text-[11px] text-[color:var(--ink-faint)]">{reason}</span>}
    </div>
  );
}
