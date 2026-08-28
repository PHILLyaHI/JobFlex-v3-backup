// Roof diagram — the renderer-agnostic LAYOUT contract.
//
// `buildDiagramLayout` (layout.ts) turns a RoofModel + chimney candidates into
// everything a drawing needs — projected rings, typed edges, placed labels, the
// north arrow, legend, totals and the sheet header — in a single flat structure
// that three renderers consume without re-deriving anything:
//   · RoofDiagram.tsx        interactive SVG in the app (desktop + handheld)
//   · renderDiagramSvg()     static SVG markup → PNG export in the browser
//   · RoofDiagramPdf.tsx     @react-pdf/renderer pages (vector) on the server
// Pure types; importable from client components.

import type { EvLineType, RoofModel } from "@/lib/eagleview";
import type { ChimneyCandidate, MeasurementSource } from "@/lib/roofDiagram/types";

/** Screen point: feet, x east, **y DOWN** (already flipped from the model's y-north). */
export interface Pt {
  x: number;
  y: number;
}

export type DiagramLayer = "lengths" | "pitch" | "area" | "ids" | "north" | "chimneys" | "legend";
export type DiagramLayers = Record<DiagramLayer, boolean>;

export const ALL_LAYERS_ON: DiagramLayers = {
  lengths: true,
  pitch: true,
  area: true,
  ids: true,
  north: true,
  chimneys: true,
  legend: true,
};

export interface DiagramOptions {
  /** Edges shorter than this get no printed length (hover-only in the app). Default 3. */
  minLabelEdgeFt: number;
  /** Padding around the roof as a fraction of the larger extent. Default 0.08. */
  padFrac: number;
}

export interface DiagramFacet {
  id: string;
  /** Printed facet ID — EagleView designator when present, else F1…Fn. */
  label: string;
  ring: Pt[];
  centroid: Pt;
  pitch: number;
  /** "6/12" */
  pitchLabel: string;
  areaSqft: number;
  /** "588 sq ft" */
  areaLabel: string;
  /** Unit vector (screen) pointing down-slope, or null when flat/unknown. */
  slopeDir: Pt | null;
}

export interface DiagramEdge {
  id: string;
  type: EvLineType;
  a: Pt;
  b: Pt;
  lengthFt: number;
  /** "24.5 ft" */
  lengthLabel: string;
  /** Placed label (collision-avoided); null when the edge is too short or nothing fit. */
  label: { pos: Pt; angleDeg: number } | null;
  /** True when shorter than minLabelEdgeFt — renderers show its label on hover only. */
  short: boolean;
}

export interface DiagramChimney {
  /** Screen centre + plan size, feet. */
  x: number;
  y: number;
  wFt: number;
  hFt: number;
  kind: ChimneyCandidate["kind"];
  method: ChimneyCandidate["method"];
  confidence: number;
  /** "CHIMNEY (approx.)" */
  label: string;
}

export interface DiagramHeader {
  /** e.g. "ROOF PLAN" */
  title: string;
  address: string;
  /** "DRAWING № RM-…" */
  drawingNo: string;
  /** ISO date */
  date: string;
  /** Human data-source line, e.g. "EagleView Instant Property Data · geometry reconstructed from aerial imagery" */
  source: string;
  company?: { name: string; logoUrl?: string | null };
}

export interface DiagramTotals {
  areaSqft: number;
  squares: number;
  predominantPitch: string;
  facetCount: number;
  /** Linear feet per type, only types that occur, in PRIMARY order first. */
  footage: Array<{ type: EvLineType; label: string; ft: number }>;
  /** Area share per pitch, descending. */
  pitchMix: Array<{ pitchLabel: string; areaSqft: number; pct: number }>;
  eaveHeights?: Array<{ facade: string; ft: number }>;
  flags?: { chimney?: boolean | null; solarPanels?: boolean | null; rooftopAcCount?: number | null; material?: string | null; conditionRating?: string | null; roofAgeYears?: number | null };
}

export interface DiagramLayout {
  /** viewBox in screen units (feet) with padding applied. */
  frame: { minX: number; minY: number; width: number; height: number };
  /** Base annotation font size in screen units — renderers scale from this. */
  fontFt: number;
  facets: DiagramFacet[];
  edges: DiagramEdge[];
  chimneys: DiagramChimney[];
  /** Compass: degrees to rotate an "up" arrow clockwise so it points true north. */
  northAngleDeg: number;
  /** Presentation-only rotation (deg, CCW in the model frame) the layout applied
   *  to the whole plan so the house sits square to the page; 0 when the model
   *  was already straight. Orientation only — figures are never rescaled. */
  axisRotationDeg?: number;
  /** Line types present, PRIMARY order first, then the rest. */
  legend: Array<{ type: EvLineType; label: string; color: string }>;
  totals: DiagramTotals;
  /** e.g. ["ESTIMATE — NOT MEASURED"], ["FACETS UNAVAILABLE"] */
  stamps: string[];
  header: DiagramHeader;
  source: MeasurementSource | "eagleview";
}

export interface BuildLayoutInput {
  model: RoofModel;
  chimneys?: ChimneyCandidate[];
  source: MeasurementSource | "eagleview";
  header: Omit<DiagramHeader, "source"> & { source?: string };
  /** From Instant when available — surfaces in totals.eaveHeights / flags. */
  extras?: {
    eaveHeights?: Array<{ facade: string; ft: number }>;
    flags?: DiagramTotals["flags"];
  };
  /**
   * Why there is no reconstruction, on the outline-only path. The stamp is
   * printed on the PDF and the PNG as well as the screen, so it has to be true
   * in all three: "FACETS UNAVAILABLE" says Google has nothing here, and saying
   * that about a network timeout is a false statement on a document a
   * contractor may price from.
   */
  reconUnavailable?: { kind: "timeout" | "no-coverage" | "config" | "error"; message: string };
  options?: Partial<DiagramOptions>;
}
