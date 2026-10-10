"use client";
// ONE CLOCK FOR THE "n s AGO" LABELS (2026-10-01). The live panel used to keep
// `now` in its own state and tick it every second, which re-rendered the whole
// panel — the platform cards, the list, the map with its 183 country shapes —
// sixty times a minute, and kept doing so in a hidden tab. Now the clock is a
// tiny store: only the labels that print a relative time subscribe to it, it
// runs only while one of them is mounted and the tab is in front, and a tab
// brought back catches up at once.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let now = Date.now();
let timer: number | null = null;
let period = 1_000;

function start() {
  if (timer !== null || typeof window === "undefined" || document.visibilityState !== "visible") return;
  timer = window.setInterval(() => { now = Date.now(); for (const l of listeners) l(); }, period);
}
function stop() {
  if (timer !== null) { window.clearInterval(timer); timer = null; }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { now = Date.now(); for (const l of listeners) l(); if (listeners.size) start(); }
    else stop();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => { listeners.delete(l); if (!listeners.size) stop(); };
}

/** The live panel's pace: every second in live mode, every ten otherwise. */
export function setClockPeriod(ms: number) {
  if (ms === period) return;
  period = ms;
  if (timer !== null) { stop(); start(); }
}

/** The current time, updated by the shared clock. 0 on the server and while
 *  hydrating — a clock read on the server and again in the browser never
 *  agrees, and React would throw the markup away (#418). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}

export function agoText(iso: string, at: number): string {
  const sec = Math.max(0, Math.round((at - Date.parse(iso)) / 1000));
  if (sec < 45) return `${sec} s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

/** "12 s ago" — the only part of a row that moves between refreshes. */
export function Ago({ iso, format = agoText }: { iso: string; format?: (iso: string, at: number) => string }) {
  const at = useNow();
  return <>{at ? format(iso, at) : "…"}</>;
}
