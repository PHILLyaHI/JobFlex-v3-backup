"use client";

// THE TRIAL CARD SWITCH (2026-10-07), at the top of Admin → Trials: card
// required at the plan step, or a card-less 7-day trial. One press, every
// door follows (lib/trialPolicyServer); the panel says what a signup gets
// right now and why, including the day's ceiling on card-less trials.
import { useState } from "react";
import { setTrialCardPolicyAction } from "@/actions/trialPolicy";
import type { TrialPolicyStatus } from "@/lib/trialPolicyServer";
import t from "./trial-policy.module.css";

export function TrialPolicyPanel({ initial }: { initial: TrialPolicyStatus }) {
  const [p, setP] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const flip = async () => {
    setPending(true);
    setError("");
    try {
      const res = await setTrialCardPolicyAction({ requiresCard: !p.requiresCard });
      if (res.ok) setP(res.policy);
      else setError(res.error);
    } catch {
      setError("The switch could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  };
  const now = p.requiresCardNow
    ? p.requiresCard
      ? "New signups add a card at the plan step; the plan's own trial runs and nothing is charged until it ends."
      : `The switch says no card, but today's ceiling of ${p.perDay} card-less trials is reached (${p.startsLastDay} in the last 24 hours), so new signups add a card until the count drops.`
    : "New signups start a 7-day trial with no card — they confirm their email instead — and add a card before day 8 to keep the plan.";
  const source = p.source === "admin"
    ? `Set here${p.at ? ` on ${new Date(p.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : ""}${p.by ? ` by ${p.by}` : ""}.`
    : `The deployment's default (${p.envDefault ? "a card up front" : "TRIAL_REQUIRES_CARD=false, no card"}); nothing set here yet.`;
  return (
    <section className={t.panel} aria-label="Free trial policy" data-requires-card={p.requiresCard} data-requires-card-now={p.requiresCardNow}>
      <div className={t.main}>
        <div className={t.kicker}>Free trial · card</div>
        <p className={t.now}>{now}</p>
        <p className={t.why}>{source} Takes effect for new signups within a minute, on every page at once; trials already running keep their terms.{p.perDay > 0 && !p.requiresCard && !p.paused ? ` Card-less trials in the last 24 hours: ${p.startsLastDay} of ${p.perDay}.` : ""}</p>
        {error && <p className={t.err} role="alert">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={p.requiresCard} className={t.switch} disabled={pending} onClick={() => void flip()}>
        <span className={t.track} aria-hidden="true"><span className={t.knob} /></span>
        <span className={t.label}>{p.requiresCard ? "Card required" : "No card needed"}</span>
        <span className={t.sub}>{pending ? "Saving…" : p.requiresCard ? "press for a trial with no card" : "press to ask for a card"}</span>
      </button>
    </section>
  );
}
