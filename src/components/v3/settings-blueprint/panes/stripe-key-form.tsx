"use client";

// "Use API key" — the form behind the second way into Stripe (2026-09-12):
// the contractor pastes their own secret / restricted key. One component for
// the Payments row, the Integrations → Stripe subpane and the phone hub;
// `variant` picks the class vocabulary (desktop settings vs mst-*). The key
// goes straight to connectStripeWithKey and is cleared on success — it lives
// in state no longer than the request.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { connectStripeWithKey, type ConnectWithKeyResult } from "@/actions/paymentConnections";
import { STRIPE_KEY_FORM } from "../settings-data";

type Variant = "desk" | "mobile";

const CLS: Record<
  Variant,
  { form: string; fld: string; lbl?: string; input: string; primary: string; ghost: string; note: string; warn: string }
> = {
  desk: {
    form: "skf",
    fld: "fld",
    input: "fin",
    primary: "btn btn-primary btn-sm",
    ghost: "btn btn-ghost btn-sm",
    note: "prow-d",
    warn: "prow-d prow-warn",
  },
  mobile: {
    form: "skf skf--m",
    fld: "mst-fld",
    lbl: "mst-fldL",
    input: "mst-in",
    primary: "mst-btn mst-btn--primary mst-btn--wide",
    ghost: "mst-btn mst-btn--ghost mst-btn--wide",
    note: "mst-rowD",
    warn: "mst-rowD is-warn",
  },
};

export type KeyConnected = Extract<ConnectWithKeyResult, { ok: true }>;

export function StripeKeyForm({
  variant = "desk",
  feePct,
  onCancel,
  onDone,
}: {
  variant?: Variant;
  /** PLATFORM_FEE_BPS / 100, for the "billed on your invoice" note. */
  feePct: number;
  onCancel?: () => void;
  /** Connected. `result.webhook` false = connected without a webhook; the
   *  form shows why, so a parent may want to keep it open in that case. */
  onDone?: (result: KeyConnected) => void;
}) {
  const router = useRouter();
  const c = CLS[variant];
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setWarn("");
    try {
      const r = await connectStripeWithKey(key);
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      setKey("");
      if (!r.webhook) setWarn(STRIPE_KEY_FORM.webhookMissing);
      onDone?.(r);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message.trim() : "";
      setErr(
        msg && !msg.toLowerCase().includes("fetch failed")
          ? msg
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={c.form} onSubmit={(e) => void submit(e)}>
      <div className={c.note}>{STRIPE_KEY_FORM.desc}</div>
      <label className={c.fld}>
        <span className={c.lbl}>{STRIPE_KEY_FORM.label}</span>
        <input
          className={c.input}
          type={show ? "text" : "password"}
          name="stripe-secret-key"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={STRIPE_KEY_FORM.placeholder}
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <label className="skf-show">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        {STRIPE_KEY_FORM.show}
      </label>
      <div className={c.note}>
        {STRIPE_KEY_FORM.testNote} {STRIPE_KEY_FORM.feeNote(feePct)}
      </div>
      {err ? (
        <div className={c.warn} role="alert">
          {err}
        </div>
      ) : null}
      {warn ? <div className={c.warn}>{warn}</div> : null}
      <div className="skf-row">
        <button className={c.primary} type="submit" disabled={busy || key.trim().length < 20}>
          {busy ? STRIPE_KEY_FORM.busy : STRIPE_KEY_FORM.submit}
        </button>
        {onCancel ? (
          <button className={c.ghost} type="button" disabled={busy} onClick={onCancel}>
            {STRIPE_KEY_FORM.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
