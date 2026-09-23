"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PortalPayModel } from "@/lib/payments/portalModel";
import { isBelowMin } from "@/lib/paymentSchedule";
import { lockScroll } from "@/lib/scrollLock";
import { startCheckout } from "./use-pay-return";
import styles from "./payment-center.module.css";

type Provider = "stripe" | "square" | "stax";
const providers: Array<{ id: Provider; name: string }> = [{ id: "stripe", name: "Stripe" }, { id: "square", name: "Square" }, { id: "stax", name: "Stax" }];

export function paymentActionLabel(model: PortalPayModel): string {
  const available = providers.filter((p) => model.providers[p.id].ok);
  if (available.length === 1 && !model.bankTransfer.ok) return "Pay with " + available[0].name;
  return available.length ? "Choose payment method" : "View payment details";
}

/** One payment center for both proposal layouts; amounts and availability come from the server. */
export function PaymentCenter({ model, onClose, initialTarget = "next", method = null }: {
  model: PortalPayModel;
  onClose: () => void;
  initialTarget?: "next" | "remaining";
  method?: "card" | "bank" | "any" | null;
}) {
  const next = model.stages.find((s) => s.id === model.nextPayableId);
  const [target, setTarget] = useState(initialTarget);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const remaining = target === "remaining" || !next;
  const amount = remaining ? model.remaining : next.amount;
  const minor = remaining ? model.remainingMinor : next.amountMinor;
  const available = providers.filter((p) => model.providers[p.id].ok && method !== "bank");
  const bank = model.bankTransfer.ok && method !== "card";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    const release = lockScroll();
    element?.showModal();
    return () => { element?.close(); release(); previous?.focus(); };
  }, []);

  async function pay(provider: Provider) {
    if (busy) return;
    setBusy(provider);
    setError("");
    try {
      const result = await startCheckout(provider, model.publicId, remaining || next?.synthetic ? "remaining" : { installmentId: next!.id });
      if (!result.ok) setError(result.error);
    } catch {
      setError("Couldn't reach the payment provider. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={styles.content}>
      <header className={styles.header}><div><p>Secure payment</p><h2 id={title}>Payment center</h2></div><button type="button" className={styles.close} aria-label="Close payment center" disabled={Boolean(busy)} onClick={onClose}>×</button></header>
      <div className={styles.body}>
        <div className={styles.amount}><span>{remaining ? "Remaining balance" : next.label}</span><strong>{amount}</strong></div>
        {next && next.amountMinor < model.remainingMinor && <div className={styles.targets} role="group" aria-label="Amount to pay">
          <button type="button" aria-pressed={!remaining} disabled={Boolean(busy)} onClick={() => setTarget("next")}>{next.label} · {next.amount}</button>
          <button type="button" aria-pressed={remaining} disabled={Boolean(busy)} onClick={() => setTarget("remaining")}>Remaining · {model.remaining}</button>
        </div>}
        {available.length > 0 && <p>Choose how you would like to pay.</p>}
        {available.map((provider) => {
          const below = isBelowMin(minor, provider.id.toUpperCase() as "STRIPE" | "SQUARE" | "STAX");
          return <div key={provider.id}><button type="button" className={styles.provider} disabled={Boolean(busy) || below || minor <= 0} onClick={() => pay(provider.id)}>
            <span>{busy === provider.id ? "Opening checkout…" : "Pay with " + provider.name}</span><span aria-hidden="true">→</span>
          </button>{below && <p className={styles.note}>Below this provider’s minimum. Select the remaining balance or contact the team.</p>}</div>;
        })}
        {bank && <details className={styles.bank} open={available.length === 0}><summary>Bank transfer</summary><p>{model.bankTransfer.instructions}</p><p>Reference: {remaining ? "Balance" : next.label}. The team will confirm when it arrives.</p></details>}
        {!available.length && !bank && <p>The team will be in touch about payment.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {available.length > 0 && <p className={styles.note}>You’ll complete payment securely with your chosen provider, then return to your proposal.</p>}
      </div>
    </div>
  </dialog>, document.body);
}
