"use client";

// TEMP (2026-09-19) — the "DEV ONLY" block on /dashboard/upgrade. Remove with
// api/dev/simulate-plan and lib/devSimulation.
//
// Simulate upgrade / downgrade move the organization a rung up or down the
// plan ladder without Stripe, then take the same return leg a checkout takes
// (?simulated= in place of ?session_id=), so the confetti, the banner, the
// sidebar locks and the quota pills all react as they would to a real
// payment. Preview dialog opens the plan dialog for one rung without changing
// anything; Replay plays the confetti again at one of its three presets.
// The last two speak through lib/devSimulation's window event.
//
// The page renders this ONLY when the server gate says so (lib/devSimulation)
// and hands it to both upgrade builds as `devTools`, so it sits inside the
// content — above the handheld shell it fell under the fixed header. On any
// Vercel build it is not in the DOM at all.

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { planDisplayName } from "@/lib/planCatalog";
import { DEV_EVENT, type DevUpgradeEvent } from "@/lib/devSimulation";

const say = (detail: DevUpgradeEvent) => window.dispatchEvent(new CustomEvent(DEV_EVENT, { detail }));

const btn: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  border: "1.5px solid currentColor",
  borderRadius: "var(--radius, 2px)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

export function DevPlanSimulator({ currentPlan, plans }: { currentPlan: string | null; plans?: readonly { slug: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [previewDir, setPreviewDir] = useState<"up" | "down">("up");

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
      // reads ?simulated= the way it reads ?session_id=; &dir= says which way.
      router.push(`/dashboard/upgrade?simulated=${encodeURIComponent(data.to)}&dir=${direction}`);
    });

  return (
    <section
      aria-label="Dev only: plan simulator"
      style={{
        margin: "0 0 18px",
        padding: "12px 14px",
        border: "1.5px dashed var(--danger, #a83232)",
        borderRadius: "var(--radius, 2px)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 10px",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--danger, #a83232)",
      }}
    >
      <b>Dev only</b>
      <span style={{ color: "var(--muted, #555)" }}>
        no Stripe · current: {currentPlan ? planDisplayName(currentPlan, plans) : "none"}
      </span>
      <span style={{ flexBasis: "100%", height: 0 }} />
      <button type="button" style={btn} disabled={pending} onClick={() => run("up")}>
        {pending ? "Working…" : "Simulate upgrade"}
      </button>
      <button type="button" style={btn} disabled={pending} onClick={() => run("down")}>
        Simulate downgrade
      </button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <button type="button" style={btn} onClick={() => say({ type: "preview-dialog", direction: previewDir })}>
          Preview dialog
        </button>
        <select
          aria-label="Preview direction"
          value={previewDir}
          onChange={(e) => setPreviewDir(e.target.value === "down" ? "down" : "up")}
          style={{ ...btn, padding: "0 8px" }}
        >
          <option value="up">up</option>
          <option value="down">down</option>
        </select>
      </span>
      <span style={{ flexBasis: "100%", height: 0 }} />
      <span style={{ color: "var(--muted, #555)" }}>Replay ·</span>
      <button type="button" style={btn} onClick={() => say({ type: "replay", preset: "light" })}>
        light
      </button>
      <button type="button" style={btn} onClick={() => say({ type: "replay", preset: "medium" })}>
        medium
      </button>
      <button type="button" style={btn} onClick={() => say({ type: "replay", preset: "heavy" })}>
        heavy
      </button>
      {note ? (
        <span role="alert" style={{ flexBasis: "100%", textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
          {note}
        </span>
      ) : null}
    </section>
  );
}
