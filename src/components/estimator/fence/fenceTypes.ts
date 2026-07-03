// Shared types for the 3D Fence Estimator Studio. Deliberately dependency-free
// (no React, no THREE) so the store, pricing, geometry, and UI all import from
// here without creating import cycles.

// Built-in material keys. Custom materials add their own ids at runtime, so any
// value carried around the app is a MaterialId (string), resolved to a label /
// colour / price via the helpers below.
export type FenceMaterial = "cedar" | "vinyl" | "chain-link" | "aluminum" | "composite";
export type MaterialId = string;

// Height is a free-form custom value in feet (installers set whatever the job is).
// FENCE_HEIGHTS are only the quick-pick presets; any positive number is valid.
export type FenceHeightFt = number;

export const FENCE_MATERIALS: FenceMaterial[] = ["cedar", "vinyl", "chain-link", "aluminum", "composite"];
export const FENCE_HEIGHTS: number[] = [4, 6, 7, 8];
export const MIN_HEIGHT_FT = 2;
export const MAX_HEIGHT_FT = 12;

export const MATERIAL_LABEL: Record<FenceMaterial, string> = {
  cedar: "Cedar",
  vinyl: "Vinyl",
  "chain-link": "Chain-link",
  aluminum: "Aluminum",
  composite: "Composite",
};

// The swatch colour for each built-in material (≈ its rendered look). Custom
// materials carry their own colour on the CustomMaterial record.
export const MATERIAL_SWATCH: Record<FenceMaterial, string> = {
  cedar: "#b07a47",
  vinyl: "#eef0ee",
  "chain-link": "#9aa0a6",
  aluminum: "#2c3036",
  composite: "#6f6a60",
};

export function isBuiltinMaterial(id: string): id is FenceMaterial {
  return (FENCE_MATERIALS as string[]).includes(id);
}

// A point on the fence path, in LOCAL FEET: +x east, +y north, origin near the
// property. The map layer converts lat/lng → these.
export interface PathPoint {
  x: number;
  y: number;
}

export type OpeningKind = "gate" | "door";
// A variant is either a built-in id below or a custom opening's id.
export type OpeningVariant = string;
export const BUILTIN_GATE_VARIANTS = ["single", "double", "arched"] as const;
export const BUILTIN_DOOR_VARIANTS = ["solid", "slatted"] as const;

// A gate or door. When `segmentIndex >= 0` it rides a fence run (`t` = 0..1 along
// points[i]→points[i+1]). When it is DETACHED (dropped away from any run) it
// carries free local-feet coords in `x`/`y` and `segmentIndex` is -1.
export interface GateSpec {
  id: string;
  segmentIndex: number;
  t: number;
  widthFt: number;
  kind: OpeningKind;
  variant: OpeningVariant;
  x?: number; // free (detached) position, local feet
  y?: number;
}

export function isDetached(g: GateSpec): boolean {
  return g.segmentIndex < 0 || (typeof g.x === "number" && typeof g.y === "number");
}

export interface OpeningPreset {
  kind: OpeningKind;
  variant: OpeningVariant;
  label: string;
  widthFt: number;
}

// Pickable opening types for the toolbelt. Gates are wider; doors are pedestrian.
export const OPENING_PRESETS: OpeningPreset[] = [
  { kind: "gate", variant: "single", label: "Single", widthFt: 4 },
  { kind: "gate", variant: "double", label: "Double", widthFt: 10 },
  { kind: "gate", variant: "arched", label: "Arched", widthFt: 4 },
  { kind: "door", variant: "solid", label: "Solid", widthFt: 3 },
  { kind: "door", variant: "slatted", label: "Slatted", widthFt: 3 },
];

export const VARIANT_LABEL: Record<string, string> = {
  single: "Single",
  double: "Double",
  arched: "Arched",
  solid: "Solid",
  slatted: "Slatted",
};

// Selectable BUILT-IN variants per kind (custom ones are appended by the UI).
export const GATE_VARIANTS: OpeningVariant[] = ["single", "double", "arched"];
export const DOOR_VARIANTS: OpeningVariant[] = ["solid", "slatted"];

// Default width (feet) for a built-in kind+variant — the seed width when an opening
// is dropped or its variant changes. Falls back to 4 ft (single walk gate).
export function presetWidthFt(kind: OpeningKind, variant: OpeningVariant): number {
  return OPENING_PRESETS.find((p) => p.kind === kind && p.variant === variant)?.widthFt ?? 4;
}

// ── Custom catalog ─────────────────────────────────────────────────────────
// User-created materials / openings. Prices live in the pricing rate card (keyed
// by id); these records carry the display metadata (name, colour, seed width).
export interface CustomMaterial {
  id: string;
  name: string;
  color: string;
}

export interface CustomOpening {
  id: string;
  kind: OpeningKind;
  name: string;
  widthFt: number;
}

export function materialLabel(id: string, custom: CustomMaterial[] = []): string {
  return MATERIAL_LABEL[id as FenceMaterial] ?? custom.find((m) => m.id === id)?.name ?? id;
}

// Rendering / swatch colour for a material id. Built-ins use their swatch; custom
// materials use the colour picked at creation.
export function materialColor(id: string, custom: CustomMaterial[] = []): string {
  return isBuiltinMaterial(id) ? MATERIAL_SWATCH[id] : (custom.find((m) => m.id === id)?.color ?? "#8a8f97");
}

export function variantLabel(variant: OpeningVariant, custom: CustomOpening[] = []): string {
  return VARIANT_LABEL[variant] ?? custom.find((o) => o.id === variant)?.name ?? variant;
}

// The full, serialisable description of a fence — everything the geometry engine
// and pricing need. `points.length - 1` segments; if the last point equals the
// first the run is a closed loop.
export interface FenceSpec {
  points: PathPoint[];
  height: FenceHeightFt;
  material: MaterialId;
  gates: GateSpec[];
  demolition: boolean;
}
