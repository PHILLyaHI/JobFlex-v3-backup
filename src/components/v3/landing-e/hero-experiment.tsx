"use client";
import type { ReactNode } from "react";
import { useTrafficExperiment } from "@/components/providers/use-traffic-experiment";

/* A/B landing_hero_v1 — THE SLOT, NOT THE TEST (scaffold, 2026-09-20).
   Registered in lib/traffic-experiments with `active: false`: no flag is
   requested, the hook answers null, and this renders its children — the
   server-rendered control headline, byte for byte what the page had before.
   Nothing swaps, nothing blinks.

   VARIANT B IS THE OWNER'S TO WRITE. Put its headline block in VARIANT_B
   below (same two elements as the control: the <h1 data-entrance="h1"> and,
   if wanted, the <p data-entrance="sub">, with the control's class names so
   the entrance animation finds them). While it is null, a visitor bucketed
   into b still sees the control.

   Before launch, know the cost: the flag resolves in the browser after the
   library has loaded (up to ~3 s after paint), so variant b would REPLACE
   the control headline on screen. If that swap is not acceptable, bucket on
   the server instead (the page is already dynamic) and keep this slot. */
const VARIANT_B: ReactNode | null = null; // TODO(owner): variant b content

function Slot({ children }: { children: ReactNode }) {
  // Exposure is reported by the hook once a variant resolves — control included.
  const variant = useTrafficExperiment("landing_hero_v1");
  return <>{variant === "b" && VARIANT_B ? VARIANT_B : children}</>;
}

export function HeroExperiment({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <Slot>{children}</Slot> : <>{children}</>;
}
