// The landing's hold on the demo copy of the HVAC estimator form
// (hvac-estimator-form.tsx, DEMO edits). The autoplay drives the handle; the
// form reports a step opened, a tier picked and a convert.

import type { NameplateRead } from "@/lib/hvac/intake";
import type { JobKind, OutdoorKind } from "@/lib/hvac/jobs";

export type DemoStep = "job" | "house" | "intake" | "design" | "estimate";
export type DemoIntakeMode = "walk" | "plates" | "type";
export type DemoSlotKey = "outdoor" | "indoor" | "panel";
export interface DemoSlot { thumb: string; read?: NameplateRead; busy?: boolean; error?: string }

export interface HvacDemoHandle {
  go(k: DemoStep): void;
  setJob(id: JobKind): void;
  /** Puts the text in the address field (the field is uncontrolled). */
  typeAddress(text: string): void;
  /** The form's own lookup — the demo site facts, then the intake step. */
  lookup(): Promise<void>;
  setMode(m: DemoIntakeMode): void;
  setPlates(p: Partial<Record<DemoSlotKey, DemoSlot>>): void;
  setTyped(t: Record<string, unknown>): void;
  setOutdoorKind(k: OutdoorKind | null): void;
  setPickId(id: string | null): void;
}

export interface HvacDemoHooks {
  bind?: (h: HvacDemoHandle | null) => void;
  onStep?: (k: DemoStep) => void;
  onPick?: (p: { tier: string; id: string; subtotal: number }) => void;
  onConvert?: () => void;
}
