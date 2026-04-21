"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";

export function PortalActions({
  publicId,
  status,
  total,
}: {
  publicId: string;
  status: string;
  total: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function accept() {
    try {
      setBusy("accept");
      const res = await fetch(`/api/public-quote/${publicId}/accept`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't record acceptance");
      toast.success("Proposal accepted", "Thank you! The team has been notified.");
      router.refresh();
    } catch (err: any) {
      toast.error("Acceptance failed", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function checkout(provider: "stripe" | "square" | "paypal") {
    try {
      setBusy(provider);
      const res = await fetch(`/api/checkout/${provider}`, {
        method: "POST",
        body: JSON.stringify({ publicId, amount: Math.round(total * 100) }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else if (data?.disabled) {
        toast.info(
          `${provider[0].toUpperCase() + provider.slice(1)} isn't configured`,
          `Add the ${provider.toUpperCase()} keys to .env to enable checkout.`,
        );
      } else {
        throw new Error(data?.error ?? "Checkout failed");
      }
    } catch (err: any) {
      toast.error("Couldn't start checkout", err?.message);
    } finally {
      setBusy(null);
    }
  }

  if (status === "ACCEPTED" || status === "PAID") {
    return (
      <div className="flex items-center gap-2 text-emerald-700 font-medium text-[14px]">
        <Check className="h-4 w-4" />
        Accepted · thank you
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" loading={busy === "accept"} onClick={accept} icon={<Check className="h-4 w-4" />}>
        Accept proposal
      </Button>
      <Button
        size="lg"
        variant="outline"
        loading={busy === "stripe"}
        onClick={() => checkout("stripe")}
        icon={<CreditCard className="h-4 w-4" />}
      >
        Pay with Stripe
      </Button>
      <Button size="lg" variant="ghost" loading={busy === "square"} onClick={() => checkout("square")}>
        Square
      </Button>
      <Button size="lg" variant="ghost" loading={busy === "paypal"} onClick={() => checkout("paypal")}>
        PayPal
      </Button>
    </div>
  );
}
