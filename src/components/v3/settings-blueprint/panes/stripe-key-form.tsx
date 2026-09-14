"use client";

// The paste-a-key form behind the second way into Stripe, Square and the
// only way into Stax (2026-09-12/13): the contractor pastes their own
// credential. One component for the Payments row, the Integrations subpane
// and the phone hub; `provider` picks the copy and the server action,
// `variant` the class vocabulary (desktop settings vs mst-*). The credential
// goes straight to the action and is cleared on success — it lives in state
// no longer than the request.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  connectSquareWithToken,
  connectStaxWithKey,
  connectStripeWithKey,
  type KeyConnectResult,
} from "@/actions/paymentConnections";
import { KEY_FORMS, type KeyProvider } from "../settings-data";

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

const ACTIONS: Record<KeyProvider, (raw: string) => Promise<KeyConnectResult>> = {
  stripe: connectStripeWithKey,
  square: connectSquareWithToken,
  stax: connectStaxWithKey,
};

export type KeyConnected = Extract<KeyConnectResult, { ok: true }>;

export interface ProviderKeyFormProps {
  provider: KeyProvider;
  variant?: Variant;
  /** PLATFORM_FEE_BPS / 100, for the "billed on your invoice" note. */
  feePct: number;
  onCancel?: () => void;
  /** Connected. `result.webhook` false = connected without a webhook; the
   *  form shows why, so a parent may want to keep it open in that case. */
  onDone?: (result: KeyConnected) => void;
}

export function ProviderKeyForm({ provider, variant = "desk", feePct, onCancel, onDone }: ProviderKeyFormProps) {
  const router = useRouter();
  const c = CLS[variant];
  const copy = KEY_FORMS[provider];
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
      const r = await ACTIONS[provider](key);
      if (!r.ok) {
        setErr(r.message);
        return;
      }
      setKey("");
      if (!r.webhook) setWarn(copy.webhookMissing);
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
      <div className={c.note}>{copy.desc}</div>
      <label className={c.fld}>
        <span className={c.lbl}>{copy.label}</span>
        <input
          className={c.input}
          type={show ? "text" : "password"}
          name={`${provider}-secret-key`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={copy.placeholder}
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <label className="skf-show">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        {copy.show}
      </label>
      <div className={c.note}>
        {copy.note} {copy.feeNote(feePct)}
      </div>
      {err ? (
        <div className={c.warn} role="alert">
          {err}
        </div>
      ) : null}
      {warn ? <div className={c.warn}>{warn}</div> : null}
      <div className="skf-row">
        <button className={c.primary} type="submit" disabled={busy || key.trim().length < 20}>
          {busy ? copy.busy : copy.submit}
        </button>
        {onCancel ? (
          <button className={c.ghost} type="button" disabled={busy} onClick={onCancel}>
            {copy.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** The Stripe form by its first name — the two panes that predate the
 *  generic one still import it. */
export function StripeKeyForm(props: Omit<ProviderKeyFormProps, "provider">) {
  return <ProviderKeyForm provider="stripe" {...props} />;
}
