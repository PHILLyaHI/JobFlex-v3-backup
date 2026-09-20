"use client";

/* THE MOMENT THE PLAN TURNS ON — the side-cannon confetti (sideConfetti.ts)
 * on the three screens where a plan actually becomes active: the signup Done
 * panel after Stripe, and the upgrade return leg, desktop and handheld.
 *
 * It renders one hidden probe element and nothing else: the probe sits
 * inside the page's token scope so the colours are read off it, and the
 * library draws on its own fixed, pointer-events: none canvas over the page.
 * Nothing is blocked, nothing waits: the parent's router.refresh() lifts the
 * sidebar locks while the pieces are still in the air.
 *
 * `active` going true fires it once; `token` changing while active fires it
 * again (the upgrade page bumps it on every return leg). With `once` the
 * first flight latches — a real payment celebrates once however the parent
 * re-renders. The DEV ONLY block's Replay buttons (lib/devSimulation
 * DEV_EVENT) are heard only when `devReplay` is set, and they ignore the
 * latch. A downgrade passes active={false}: the banner alone says it.
 */

import { useEffect, useRef } from "react";
import { DEV_EVENT, type DevUpgradeEvent } from "@/lib/devSimulation";
import { fireSideConfetti, type ConfettiPreset } from "./sideConfetti";

/** The preset a real activation plays — the owner's pick (2026-09-19). */
export const DEFAULT_PRESET: ConfettiPreset = "medium";

export function PlanConfetti({
  active,
  token = 0,
  preset = DEFAULT_PRESET,
  once = true,
  devReplay = false,
}: {
  active: boolean;
  token?: number;
  preset?: ConfettiPreset;
  once?: boolean;
  devReplay?: boolean;
}) {
  const probe = useRef<HTMLSpanElement>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (once && played.current) return;
    played.current = true;
    void fireSideConfetti(preset, probe.current);
  }, [active, token, preset, once]);

  useEffect(() => {
    if (!devReplay) return;
    const onDev = (e: Event) => {
      const d = (e as CustomEvent<DevUpgradeEvent>).detail;
      if (d?.type === "replay") void fireSideConfetti(d.preset, probe.current);
    };
    window.addEventListener(DEV_EVENT, onDev);
    return () => window.removeEventListener(DEV_EVENT, onDev);
  }, [devReplay]);

  return <span ref={probe} hidden aria-hidden="true" data-plan-confetti="" />;
}
