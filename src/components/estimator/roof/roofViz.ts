// Client-safe shared constants/helpers for the roof visualizations. Types are
// imported type-only from the server module (fully erased — no server code is
// bundled into the client).
import type { EvLineType } from "@/lib/eagleview";

// Canned sandbox reports — the whole UI works against these with ZERO billable
// orders (Bid Perfect roofing reports; ids from the sandbox Postman collection).
// Kept here (not in the "use server" actions file, which may only export async
// functions) so it stays a real array on the client.
export const EV_SAMPLES = [
  { reportId: 69153261, label: "Single structure", detail: "419 Prairie Ridge Ln, North Aurora IL" },
  { reportId: 69077209, label: "Multiple structures", detail: "Bid Perfect sample" },
  { reportId: 69110976, label: "Complex structure", detail: "Bid Perfect sample" },
] as const;

// Functional line-type palette for the roof diagram legend. These are
// data-visualization semantics (a CAD-style legend), kept muted to sit beside
// the editorial UI chrome — distinct from the app's locked accent system.
export const LINE_COLORS: Record<EvLineType, string> = {
  RIDGE: "#1f7a52", // Pressed Sage — the peak lines
  HIP: "#b45309", //   amber
  VALLEY: "#1d4ed8", // blue
  RAKE: "#7c3aed", //  violet
  EAVE: "#334155", //  slate (perimeter baseline)
  FLASHING: "#be123c", // rose
  STEPFLASH: "#db2777", // pink
  OTHER: "#94a3b8", // faint slate
};

export const LINE_LABEL: Record<EvLineType, string> = {
  RIDGE: "Ridge",
  HIP: "Hip",
  VALLEY: "Valley",
  RAKE: "Rake",
  EAVE: "Eave",
  FLASHING: "Flashing",
  STEPFLASH: "Step flashing",
  OTHER: "Other",
};

// Lines that carry real roofing meaning (shown thicker + labelled). FLASHING /
// STEPFLASH / OTHER are drawn thinner.
export const PRIMARY_LINE_TYPES: EvLineType[] = ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE"];

// Azimuth degrees (0=N, 90=E, 180=S, 270=W) → 8-point compass label.
export function cardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function pitchLabel(pitch: number): string {
  return `${Math.round(pitch)}/12`;
}

// Feet (decimal) → "12' 6\"" for length labels.
export function feetInches(ft: number): string {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches === 12) return `${whole + 1}'`;
  return inches ? `${whole}' ${inches}"` : `${whole}'`;
}

// ── Blueprint view modes ──────────────────────────────────────────────────────
// What information the 2D/3D diagram overlays. Shared by both viewers + the
// segmented filter control.
export type LabelMode = "shaded" | "pitch" | "area" | "length";

export const LABEL_MODES: { id: LabelMode; label: string }[] = [
  { id: "shaded", label: "Shaded" },
  { id: "pitch", label: "Pitch" },
  { id: "area", label: "Area" },
  { id: "length", label: "Length" },
];

// Bare numerals for the diagram labels (match the reference screenshots).
export const pitchNumber = (pitch: number): string => String(Math.round(pitch));
export const areaNumber = (sqft: number): string => Math.round(sqft).toLocaleString("en-US");
export const feetWhole = (ft: number): string => String(Math.round(ft));
