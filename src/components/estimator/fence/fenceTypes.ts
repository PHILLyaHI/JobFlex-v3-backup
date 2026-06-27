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

// A gate on a segment. `segmentIndex` indexes points[i]→points[i+1]; `t` is the
// 0..1 position of the gate centre along that segment. Geometry for gates lands
// in Phase 3; Phase 1 uses the count for pricing only.
export interface GateSpec {
  id: string;
  segmentIndex: number;
  t: number;
  widthFt: number;
}

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
