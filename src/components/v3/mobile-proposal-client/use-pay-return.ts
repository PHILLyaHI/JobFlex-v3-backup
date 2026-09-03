"use client";
// After a hosted checkout hands the client back (?paid=1&ref=…), the webhook
// may not have landed yet. Poll pay-status — which actively verifies with the
// provider — every 3 s for up to a minute, then refresh the server tree once
// the money shows. Shared by the desktop portal and the handheld build.
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type PayReturnState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "paid"; proposalPaid: boolean }
  | { kind: "slow" }
  | { kind: "canceled" };

const INTERVAL_MS = 3000;
const MAX_TICKS = 20;

export function usePayReturn(publicId: string): PayReturnState {
  const router = useRouter();
  const params = useSearchParams();
  const paid = params.get("paid") === "1";
  const canceled = params.get("canceled") === "1";
  const ref = params.get("ref") ?? "";
  const [state, setState] = useState<PayReturnState>(
    paid ? { kind: "processing" } : canceled ? { kind: "canceled" } : { kind: "idle" },
  );

  useEffect(() => {
    if (!paid) return;
    let ticks = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      ticks += 1;
      try {
        const res = await fetch(
          `/api/public-quote/${publicId}/pay-status?ref=${encodeURIComponent(ref)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          proposalStatus?: string;
          pending?: boolean;
          verified?: string | null;
          stages?: { status: string }[];
        };
        const anyPaid = (data.stages ?? []).some((s) => s.status === "PAID");
        if (!alive) return;
        if (data.verified === "paid" || (anyPaid && !data.pending)) {
          setState({ kind: "paid", proposalPaid: data.proposalStatus === "PAID" });
          router.refresh();
          return;
        }
      } catch {
        // network hiccup — keep polling
      }
      if (!alive) return;
      if (ticks >= MAX_TICKS) {
        setState({ kind: "slow" });
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    }
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [paid, publicId, ref, router]);

  return state;
}

/** POST to the pay route and hand the browser to the provider. */
export async function startCheckout(
  provider: "stripe" | "square",
  publicId: string,
  target: { installmentId: string } | "remaining",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/pay/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicId, target }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.ok && data.url) {
    window.location.assign(data.url);
    return { ok: true };
  }
  return { ok: false, error: data.error ?? "Couldn't start checkout — please try again." };
}
