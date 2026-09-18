// Fence estimator blueprint — the page's opening presets.
//
// The fence TYPES, their heights and every rate come from lib/fence (the
// FenceScan engine, ported 2026-09-18). An opening's PRICE is derived from
// the picked type's walk-gate rate and the opening's width, so the ticket,
// the proposal and the 3D scene read one set of numbers. The WIDTHS are the
// donor's: they are what the map draws and what the 3D scene hangs.

export type OpeningType = {
  id: string;
  kind: "gate" | "door";
  label: string;
  width: number;
  /** The engine's variant word — an arched top or a slatted door costs more. */
  variant: string;
};

export const OPENINGS: OpeningType[] = [
  { id: "single", kind: "gate", label: "Single gate", width: 4, variant: "single" },
  { id: "double", kind: "gate", label: "Double gate", width: 8, variant: "double" },
  { id: "triple", kind: "gate", label: "Triple gate", width: 12, variant: "triple" },
  { id: "arched", kind: "gate", label: "Arched gate", width: 4, variant: "arched" },
  { id: "solid", kind: "door", label: "Solid door", width: 3, variant: "solid" },
  { id: "slatted", kind: "door", label: "Slatted door", width: 3, variant: "slatted" },
];

/** The page's default tear-out rate, $/lf — the shop edits it on the Site row. */
export const DEFAULT_REMOVAL_PER_LF = 6;
