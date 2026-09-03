"use client";

// PUBLIC PROPOSAL PORTAL — the payment schedule, now something the client can
// ACT on. Route: /portal/q/[publicId] (desktop tree; the handheld build has
// its own rendering of the same PortalPayModel).
//
// The donor's `.pv-pay` register is kept row-for-row (number · label · share ·
// amount); what is new is a status plate on each row and, on the ONE stage
// that is next to pay, the buttons that hand the client to the contractor's
// own Stripe / Square checkout (or show the contractor's bank details). Stages
// are paid in order; "Pay remaining balance" clears everything at once.
//
// Money is never computed here — the model arrives from the server already
// resolved (paid stages frozen, unpaid recomputed, remaining = total − paid).

import { Suspense, useState } from "react";
import { toast } from "@/components/ui/Toast";
import type { PortalPayModel, PortalStage } from "@/lib/payments/portalModel";
import { startCheckout, usePayReturn } from "@/components/v3/mobile-proposal-client/use-pay-return";

type Provider = "stripe" | "square";

function statusWord(s: PortalStage): string {
  if (s.status === "PAID") return s.paidOn ? `Paid · ${s.paidOn}` : "Paid";
  if (s.status === "PENDING") return "Processing";
  if (s.status === "WAIVED") return "Closed";
  return s.payable ? "Due now" : "Due";
}

function PayReturnBanner({ publicId }: { publicId: string }) {
  const state = usePayReturn(publicId);
  if (state.kind === "idle") return null;
  if (state.kind === "canceled") return null;
  return (
    <div className={`pv-payret pv-payret--${state.kind}`} role="status" aria-live="polite">
      {state.kind === "processing"
        ? "Confirming your payment…"
        : state.kind === "paid"
          ? state.proposalPaid
            ? "✓ Paid in full — thank you."
            : "✓ Payment received — thank you."
          : "Your payment is taking a moment to confirm. You'll get an email receipt as soon as it lands."}
    </div>
  );
}

export function PortalPayment({ model }: { model: PortalPayModel }) {
  const [busy, setBusy] = useState<string | null>(null);
  const accepted = model.status === "ACCEPTED";
  const paidInFull = model.status === "PAID" || (model.remainingMinor <= 0 && model.paidMinor > 0);

  async function pay(provider: Provider, target: { installmentId: string } | "remaining") {
    const key = `${provider}:${typeof target === "string" ? target : target.installmentId}`;
    setBusy(key);
    const res = await startCheckout(provider, model.publicId, target);
    if (!res.ok) {
      toast.error("Couldn't start checkout", res.error);
      setBusy(null);
    }
  }

  const cardLabel = model.providers.stripe.ach ? "Pay with card or bank" : "Pay with card";

  function buttons(stage: PortalStage | null) {
    const target = stage ? { installmentId: stage.id } : ("remaining" as const);
    const idKey = stage ? stage.id : "remaining";
    const below = stage?.belowMin ?? { stripe: false, square: false };
    return (
      <div className="pv-btnrow pv-pay-btns">
        {model.providers.stripe.ok ? (
          <button
            className="pv-btn pv-btn--primary pv-btn--pay"
            type="button"
            disabled={busy !== null || below.stripe}
            title={below.stripe ? "Below the card minimum — pay the remaining balance instead" : undefined}
            onClick={() => pay("stripe", target)}
          >
            {busy === `stripe:${idKey}` ? "Opening…" : cardLabel}
          </button>
        ) : null}
        {model.providers.square.ok ? (
          <button
            className="pv-btn pv-btn--ghost pv-btn--pay"
            type="button"
            disabled={busy !== null || below.square}
            title={below.square ? "Below the Square minimum — pay the remaining balance instead" : undefined}
            onClick={() => pay("square", target)}
          >
            {busy === `square:${idKey}` ? "Opening…" : "Pay with Square"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="pv-sec rv" id="pvPayment">
      <h2 className="pv-sec-h">Payment schedule</h2>
      <Suspense fallback={null}>
        <PayReturnBanner publicId={model.publicId} />
      </Suspense>

      <div className="pv-pay">
        {model.stages.map((s) => {
          const active = accepted && s.payable && model.anyWay;
          return (
            <div
              className={`pv-pay-r${s.status === "PAID" ? " is-paid" : ""}${s.status === "WAIVED" ? " is-waived" : ""}${active ? " is-next" : ""}`}
              key={s.id}
            >
              <div className="pv-pay-line">
                <span className="pv-pay-no">{s.no}</span>
                <span className="pv-pay-n">{s.label}</span>
                <span className={`pv-pay-st pv-pay-st--${s.status.toLowerCase()}`}>{statusWord(s)}</span>
                <span className="pv-pay-pct">{s.share}</span>
                <span className="pv-pay-v">{s.amount}</span>
              </div>
              {active ? (
                <div className="pv-pay-act">
                  {model.anyHosted ? buttons(s) : null}
                  {model.bankTransfer.ok ? (
                    <details className="pv-pay-bank">
                      <summary>{model.anyHosted ? "Or pay by bank transfer" : "Pay by bank transfer"}</summary>
                      <pre className="pv-pay-bank-body">{model.bankTransfer.instructions}</pre>
                      <div className="pv-pay-bank-note">
                        {`Reference "${s.label}" — the team will mark it paid once it arrives.`}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {accepted && model.showRemaining && model.anyHosted ? (
        <div className="pv-pay-all">
          <div className="pv-pay-all-l">{`Or settle everything now — ${model.remaining}`}</div>
          {buttons(null)}
        </div>
      ) : null}

      {model.paidMinor > 0 && !paidInFull ? (
        <div className="pv-pay-sum">
          <span>{`Paid to date ${model.paid}`}</span>
          <b>{`Remaining ${model.remaining}`}</b>
        </div>
      ) : null}
      {paidInFull ? <div className="pv-pay-sum pv-pay-sum--done">✓ Paid in full</div> : null}
      {accepted && !model.anyWay ? (
        <div className="pv-pay-sum">The team will be in touch about payment.</div>
      ) : null}
    </section>
  );
}
