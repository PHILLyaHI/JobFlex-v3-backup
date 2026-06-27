// Shared types for the 3D Fence Estimator Studio. Deliberately dependency-free
// (no React, no THREE) so the store, pricing, geometry, and UI all import from
// here without creating import cycles.

export type FenceMaterial = "cedar" | "vinyl" | "chain-link" | "aluminum" | "composite";
export type FenceHeightFt = 4 | 6 | 7 | 8;

export const FENCE_MATERIALS: FenceMaterial[] = ["cedar", "vinyl", "chain-link", "aluminum", "composite"];
export const FENCE_HEIGHTS: FenceHeightFt[] = [4, 6, 7, 8];

export const MATERIAL_LABEL: Record<FenceMaterial, string> = {
  cedar: "Cedar",
  vinyl: "Vinyl",
  "chain-link": "Chain-link",
  aluminum: "Aluminum",
  composite: "Composite",
};

// A point on the fence path, in LOCAL FEET: +x east, +y north, origin near the
// property. The map layer (Phase 2) converts lat/lng → these; Phase 1 seeds them
// directly with a mock polyline.
export interface PathPoint {
  x: number;
  y: number;
}

export type OpeningKind = "gate" | "door";
export type OpeningVariant = "single" | "double" | "arched" | "solid" | "slatted";

// A gate or door on a segment. `segmentIndex` indexes points[i]→points[i+1]; `t`
// is the 0..1 position of the opening centre along that segment.
export interface GateSpec {
  id: string;
  segmentIndex: number;
  t: number;
  widthFt: number;
  kind: OpeningKind;
  variant: OpeningVariant;
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

export const VARIANT_LABEL: Record<OpeningVariant, string> = {
  single: "Single",
  double: "Double",
  arched: "Arched",
  solid: "Solid",
  slatted: "Slatted",
};

// The full, serialisable description of a fence — everything the geometry engine
// and pricing need. `points.length - 1` segments; if the last point equals the
// first the run is a closed loop.
export interface FenceSpec {
  points: PathPoint[];
  height: FenceHeightFt;
  material: FenceMaterial;
  gates: GateSpec[];
  demolition: boolean;
}
