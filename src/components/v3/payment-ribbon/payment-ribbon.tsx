"use client";
// "PAYMENT FAILED · UPDATE YOUR CARD" (owner, 2026-10-07; lib/cardUpdate).
//
// Over every dashboard page while the subscription is PAST_DUE — a renewal
// charge was declined and Stripe is retrying. The plan stays open meanwhile
// (lib/planStatus); this is the way out. The button asks
// /api/billing/update-card for Stripe Checkout (setup mode) and leaves for it;
// the return pays what is owed with the new card, and the ribbon goes with
// the PAST_DUE status. Only the owner updates the card; everyone else is told
// who can. The card-less trial's ribbon styles (trial-card.module.css) — one
// look for both billing ribbons, the rose tone of "Trial ended".
//
// CardUpdateNotice is the return's word: a toast on /dashboard/subscription
// after Checkout, then the query string is dropped.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import s from "../trial-card/trial-card.module.css";

export function useUpdateCard() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const leaving = React.useRef(false);
  React.useEffect(() => {
    // Back from Stripe through the back/forward cache: idle again.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && leaving.current) {
        leaving.current = false;
        setBusy(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const go = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/update-card", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        leaving.current = true;
        window.location.href = body.url;
        return;
      }
      setError(body.error || "Couldn't open the card form. Try again.");
    } catch {
      setError("Couldn't reach billing. Try again.");
    }
    setBusy(false);
  }, [busy]);
  return { go, busy, error };
}

export function PaymentRibbon({ isOwner, only }: { isOwner: boolean; only?: "dock" }) {
  const button = (label: string) =>
    isOwner ? (
      <Link className={s.button} href="/dashboard/subscription" data-payment-ribbon="review-payment">{label}</Link>
    ) : null;
  // At handheld width the owner's dock is the stamp and the button alone —
  // a line of text beside both broke mid-word in the 300px between them.
  const dock = (
    <div className={`${s.dock} ${s.isEnded}`} role="alert" data-payment-ribbon="dock">
      <span className={s.stamp}>Payment failed</span>
      {!isOwner ? (
        <p className={s.dockText}>
          Ask the owner to review billing
        </p>
      ) : null}
      {button("Review payment")}
    </div>
  );
  if (only === "dock") return dock;
  return (
    <>
      {dock}
      <div className={`${s.ribbon} ${s.isEnded}`} role="alert" data-payment-ribbon="ribbon">
        <span className={s.stamp}>Payment failed</span>
        <p className={s.ribbonText}>
          <b>Check your payment.</b>{" "}
          <span>The payment for your plan did not go through. Review the invoice, retry payment or update your card.</span>
        </p>
        {button("Review payment") ?? (
          <span className={s.ribbonText}>
            <span>Ask the owner to update the card.</span>
          </span>
        )}
      </div>
    </>
  );
}

export type CardUpdateNoticeKind = "paid" | "saved" | "declined" | "cancelled" | "error";

export function CardUpdateNotice({ kind, detail }: { kind: CardUpdateNoticeKind; detail?: string }) {
  const router = useRouter();
  const shown = React.useRef(false);
  React.useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    if (kind === "paid") toast.success("Card updated", "The payment went through — your plan is active again.");
    else if (kind === "saved") toast.success("Card updated", "It will be used for your next bill.");
    else if (kind === "declined") toast.error("Payment could not be completed", "Review the payment details on Subscription or try another card.");
    else if (kind === "cancelled") toast.info("No card was added", "Your card on file is unchanged.");
    else toast.error("Couldn't update the card", detail ?? "Try again in a minute.");
    router.replace("/dashboard/subscription");
    router.refresh();
  }, [kind, detail, router]);
  return null;
}
