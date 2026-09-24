"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PortalPayModel } from "@/lib/payments/portalModel";
import { proposalAcceptanceSchema } from "@/lib/proposalAcceptance";
import { PaymentCenter, paymentActionLabel } from "./payment-center";
import styles from "./proposal-decision.module.css";

/** The same decision and typed name follow the reader when the inline form leaves view. */
export function ProposalDecision({ settled, busy, model, acceptedMessage, onAccept, onDecline }: {
  settled: string | null;
  busy: boolean;
  model: PortalPayModel;
  acceptedMessage: ReactNode;
  onAccept: (name: string) => Promise<void>;
  onDecline: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [offscreen, setOffscreen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const id = useId();
  const canPay = settled === "accepted" && model.remainingMinor > 0 && model.anyWay;
  const positive = settled === "accepted" || settled === "paid";
  const visible = !settled || positive;
  const stickyAvailable = !settled || canPay;

  useEffect(() => {
    const el = anchor.current;
    if (!el || !stickyAvailable || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(entry.intersectionRatio < 1), { threshold: 1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stickyAvailable, settled]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = proposalAcceptanceSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      event.currentTarget.querySelector("input")?.focus();
      return;
    }
    setError("");
    await onAccept(parsed.data.name);
  }

  function content(sticky: boolean) {
    if (positive) return <div className={styles.settled}>
      <div className={styles.confirmation}>{sticky ? <span>Accepted — thank you.</span> : acceptedMessage}</div>
      {canPay && <button type="button" className={styles.primary} disabled={busy} onClick={() => setPayOpen(true)} aria-haspopup="dialog">{paymentActionLabel(model)}</button>}
    </div>;
    const fieldId = id + (sticky ? "-sticky" : "-inline");
    return <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={fieldId}>Your full name</label>
        <input id={fieldId} name="acceptanceName" autoComplete="name" required maxLength={120} value={name} disabled={busy}
          placeholder="Type your name to accept" aria-invalid={Boolean(error)} aria-describedby={error ? fieldId + "-error" : undefined}
          onChange={(event) => { setName(event.target.value); setError(""); }} />
        {error && <p className={styles.error} id={fieldId + "-error"} role="alert">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Accept proposal"}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onDecline}>Decline</button>
      </div>
    </form>;
  }

  if (!visible) return null;
  return <>
    <div ref={anchor} className={styles.inline}>{content(false)}</div>
    {offscreen && stickyAvailable && createPortal(<div className={styles.bar} aria-label="Proposal actions"><div className={styles.barInner}>{content(true)}</div></div>, document.body)}
    {payOpen && <PaymentCenter model={model} onClose={() => setPayOpen(false)} />}
  </>;
}
