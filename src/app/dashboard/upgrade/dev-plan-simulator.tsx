"use client";

// TEMP (2026-09-19) — the "DEV ONLY" block on /dashboard/upgrade. Remove with
// api/dev/simulate-plan and lib/devSimulation.
//
// Two buttons that move the organization a rung up or down the plan ladder
// without Stripe, then reload the page the way a checkout return does — so
// the stamp, the sidebar locks and the quota pills all react as they would to
// a real payment. The page mounts this ONLY when the server gate says so
// (lib/devSimulation); on any Vercel build it is not in the DOM at all.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DevPlanSimulator({ currentPlan }: { currentPlan: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const run = (direction: "up" | "down") =>
    start(async () => {
      setNote(null);
      const res = await fetch("/api/dev/simulate-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; to?: string; error?: string };
      if (!res.ok || !data.ok || !data.to) {
        setNote(data.error ?? `The simulator answered ${res.status}.`);
        return;
      }
      // The same return leg a paid checkout takes, minus Stripe: the page
      // reads ?simulated= the way it reads ?session_id= and plays the stamp.
      router.push(`/dashboard/upgrade?simulated=${encodeURIComponent(data.to)}`);
    });

  return (
    <section
      aria-label="Dev only: plan simulator"
      style={{
        margin: "0 0 18px",
        padding: "12px 16px",
        border: "1.5px dashed var(--danger, #a83232)",
        borderRadius: "var(--radius, 2px)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 14px",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--danger, #a83232)",
      }}
    >
      <b>Dev only</b>
      <span style={{ color: "var(--muted, #555)" }}>
        plan simulator · no Stripe · current: {currentPlan?.toLowerCase() || "none"}
      </span>
      <span style={{ flex: "1 1 auto" }} />
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run("down")}>
        Simulate downgrade
      </button>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("up")}>
        {pending ? "Working…" : "Simulate upgrade"}
      </button>
      {note ? (
        <span role="alert" style={{ flexBasis: "100%", textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
          {note}
        </span>
      ) : null}
    </section>
  );
}
