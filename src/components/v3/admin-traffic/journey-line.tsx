"use client";
// THE JOURNEY LINE (2026-10-02): a visit drawn as a running line — one dot per
// screen or step, each in the colour of the stage it belongs to (crimson
// looking around, cyan signing in, amber on the form or at checkout, green
// signed up, near-black in the app), joined left to right in the order it
// happened. While the visitor is on the site the line runs and the current
// step pulses; once they have left it stands still. The same colours the
// map's pins and the list's marks use, so a row, its pin and its journey agree.
import type { LiveStage, LiveVisitor } from "@/lib/traffic-live";
import s from "./traffic.module.css";

const WORD: Record<LiveStage, string> = { browsing: "looking around", "signing-in": "signing in", registering: "signing up", checkout: "at checkout", "signed-up": "signed up", member: "in the app" };

export function JourneyLine({ steps, live, compact = false }: { steps: LiveVisitor["steps"]; live: boolean; compact?: boolean }) {
  if (!steps || steps.length === 0) return null;
  const said = steps.map((x) => `${x.label} (${WORD[x.kind]})`).join(", then ");
  return (
    <ol className={s.journey} data-live={live} data-compact={compact} aria-label={`The visit, step by step: ${said}${live ? " — on the site now" : ""}`}>
      {steps.map((x, i) => (
        <li key={`${i}-${x.label}`} className={s.journeyStep} data-kind={x.kind} data-last={i === steps.length - 1} title={`${x.label} · ${WORD[x.kind]}`}>
          <i className={s.journeyDot} aria-hidden="true"/>
          <span className={s.journeyLabel}>{x.label}</span>
        </li>
      ))}
    </ol>
  );
}
