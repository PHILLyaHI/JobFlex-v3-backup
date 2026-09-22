"use client";

// Partner portal — the few pieces the three surfaces share that the admin kit
// does not already publish.
//
// Everything else is IMPORTED, not rebuilt: Chip / Empty / Ic / KpiStrip / Meta
// / CopyRow / actionError / cx / useReveal all come from
// admin-influencers/admin-ui, whose comment already names itself "the primitive
// layer shared by the three partner-money pages". A partner portal is the
// fourth. A second implementation of any of them would be a bug, not a variant
// (decisions.md, "SHARED MODULES — IMPORT, DO NOT RE-DERIVE").
//
// What is here: the Connect call-to-action, the Request-payout control, and the
// hold-window sentence — three things only a partner sees.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ic, actionError, cx } from "@/components/v3/admin-influencers/admin-ui";
import ui from "@/components/v3/admin-influencers/admin-ui.module.css";
import { createConnectOnboardingLink } from "@/actions/connect";
import { requestPayout } from "@/actions/influencers";
import type { ConnectDTO } from "./portal-data";
import styles from "./portal.module.css";

/* ============================================================
   CONNECT — the one thing standing between earning and being paid
   ============================================================ */

const CONNECT_COPY: Record<string, { title: string; body: string; cta: string }> = {
  NONE: {
    title: "Set up payouts",
    body: "Connect a Stripe account so we have somewhere to send your commission. You earn before this is done — we just cannot pay it out yet.",
    cta: "Connect Stripe",
  },
  ONBOARDING: {
    title: "Finish setting up payouts",
    body: "Stripe still needs a few details from you. Your commission keeps accruing in the meantime.",
    cta: "Continue",
  },
  RESTRICTED: {
    title: "Stripe needs something from you",
    body: "Stripe has paused payouts on your account until it gets more information. Open it to see what is missing.",
    cta: "Open Stripe",
  },
  DISABLED: {
    title: "Payouts are disabled",
    body: "Stripe has disabled payouts on this account. Open it to see why, or write to us.",
    cta: "Open Stripe",
  },
};

export function ConnectBanner({ connect }: { connect: ConnectDTO }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (connect.payoutsEnabled && connect.status === "ENABLED") return null;
  const copy = CONNECT_COPY[connect.status] ?? CONNECT_COPY.NONE;

  async function onboard() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createConnectOnboardingLink();
      window.location.href = url;
    } catch (err) {
      setError(actionError(err));
      setBusy(false);
    }
  }

  return (
    <section className={cx("card", styles.connect, "rv")}>
      <div className={styles.connectMark} aria-hidden="true">
        <Ic name="bank" />
      </div>
      <div className={styles.connectTxt}>
        <div className={styles.connectTitle}>{copy.title}</div>
        <p className={styles.connectBody}>{copy.body}</p>
        {error ? (
          <div className={cx(ui.bannerErr, styles.connectErr)} role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <button type="button" className={cx("btn", styles.connectBtn)} onClick={onboard} disabled={busy}>
        {busy ? "Opening…" : copy.cta}
      </button>
    </section>
  );
}

/* ============================================================
   REQUEST PAYOUT — the refusal arrives as words
   ============================================================ */

/**
 * `reason` is the sentence lib/payouts already decided, computed on the server
 * from the same helper the action uses — so the hint under a disabled button and
 * the answer to a press can never disagree. A press is still made: the server
 * re-checks against live balances, and returns its own refusal if the numbers
 * moved between the render and the click.
 */
export function RequestPayoutButton({ reason }: { reason: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setSaid(null);
    try {
      // An envelope, not a throw: production redacts a thrown Server Action
      // message, so a refusal has to come back as a value to be readable.
      const res = await requestPayout();
      if (!res.ok) setSaid(res.error);
      router.refresh();
    } catch (err) {
      setSaid(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.payoutAct}>
      <button
        type="button"
        className={cx("btn", styles.payoutBtn)}
        onClick={submit}
        disabled={busy || reason !== null}
      >
        <Ic name="download" />
        {busy ? "Requesting…" : "Request payout"}
      </button>
      {(said ?? reason) ? (
        <p className={styles.payoutWhy} role={said ? "alert" : undefined}>
          {said ?? reason}
        </p>
      ) : null}
    </div>
  );
}

/* ============================================================
   THE HOLD WINDOW, IN WORDS
   ============================================================ */

/** Why money sits in "clearing" — asked every time it is not answered on screen. */
export function HoldNote({ holdDays }: { holdDays: number }) {
  return (
    <p className={styles.holdNote}>
      {holdDays === 0
        ? "Commission is payable as soon as the payment it came from succeeds."
        : `Commission becomes payable ${holdDays} days after the payment it came from, so a refund in that window cancels it instead of clawing it back.`}
    </p>
  );
}
