"use client";

// THE SIGN-UP'S STEPS (owner, 2026-10-07), under the card switch on Admin →
// Trials: 3 (account · company · plan) or 2 (account with the business name
// and the trades, folded · plan). Same clothes as the card panel.
import { useState } from "react";
import { setSignupStepsAction } from "@/actions/trialPolicy";
import type { SignupFlow } from "@/lib/trialPolicyServer";
import t from "./trial-policy.module.css";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function SignupStepsPanel({ initial }: { initial: SignupFlow }) {
  const [p, setP] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const two = p.steps === 2;
  const flip = async () => {
    setPending(true);
    setError("");
    try {
      const res = await setSignupStepsAction({ steps: two ? 3 : 2 });
      if (res.ok) setP(res.signup);
      else setError(res.error);
    } catch {
      setError("The switch could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  };
  const now = two
    ? "Two steps: one account screen — name, email, password, business name and the trades, folded — then the plan. The trades say what the shop does, not what leads it gets: leads come once it sets its specialties and address on its company page."
    : "Three steps: account, then the company (name, address, phone, trades), then the plan — as built.";
  const why = p.source === "admin" ? `Set here${p.at ? ` on ${when(p.at)}` : ""}${p.by ? ` by ${p.by}` : ""}.` : "The default; nothing set here yet.";
  return (
    <section className={t.panel} aria-label="Sign-up steps" data-steps={p.steps}>
      <div className={t.main}>
        <div className={t.kicker}>Sign-up · steps</div>
        <p className={t.now} aria-live="polite">{now}</p>
        <p className={t.why}>{why} Takes effect for new signups within seconds; every sign-up step event carries its step count, so the two can be compared on the traffic page.</p>
        {error && <p className={t.err} role="alert">{error}</p>}
      </div>
      <div className={t.actions}>
        <button type="button" role="switch" aria-checked={two} aria-label="Two-step sign-up" className={t.switch} disabled={pending} onClick={() => void flip()}>
          <span className={t.track} aria-hidden="true"><span className={t.knob} /></span>
          <span className={t.label}>{two ? "2 steps" : "3 steps"}</span>
          <span className={t.sub}>{pending ? "Saving…" : two ? "press for the three-step sign-up" : "press for the two-step sign-up"}</span>
        </button>
      </div>
    </section>
  );
}
