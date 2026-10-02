"use client";

import { useState, useTransition } from "react";
import { updateSignupAllocation } from "@/actions/signupExperiment";
import type { SignupAllocation } from "@/lib/signupExperiment";
import s from "./signup-experiment.module.css";

const options = [
  { value: "split", label: "Both variants", detail: "50% A · 50% B" },
  { value: "a", label: "Only A", detail: "100% A · B off" },
  { value: "b", label: "Only B", detail: "100% B · A off" },
] as const;

export function AllocationControl({ mode }: { mode: SignupAllocation }) {
  const [selected, setSelected] = useState(mode);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function save() {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const result = await updateSignupAllocation(selected);
        setMessage(result.mode === "split" ? "Saved. New browsers receive A or B with equal probability." : `Saved. New browsers receive only variant ${result.mode.toUpperCase()}.`);
      } catch {
        setError("Could not save the allocation. Refresh to check your admin access and try again.");
      }
    });
  }

  return <section className={s.card} aria-labelledby="allocation-title">
    <h2 id="allocation-title">Active signup variants</h2>
    <p>Choose which flow new browsers receive. Browsers that already started registration and existing accounts keep their original variant.</p>
    <form action={save}>
      <fieldset className={s.allocation} disabled={pending} aria-describedby="allocation-help">
        <legend className={s.kicker}>New browser allocation</legend>
        <div className={s.allocationOptions}>{options.map(option => <label className={s.allocationOption} key={option.value}>
          <input type="radio" name="allocation" value={option.value} checked={selected === option.value} onChange={() => { setSelected(option.value); setMessage(""); setError(""); }} />
          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
        </label>)}</div>
      </fieldset>
      <p id="allocation-help">Single-variant registrations still appear in totals, but do not enter the A/B winner comparison.</p>
      <button className={s.button} type="submit" disabled={pending || selected === mode}>{pending ? "Saving…" : "Save allocation"}</button>
      {message && <p role="status">{message}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </form>
  </section>;
}
