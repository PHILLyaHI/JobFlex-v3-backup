import type { ReactNode } from "react";
import type { RoofFacts, RoofPackage, RoofPackageSpec } from "@/lib/roofPackage/takeoff";

export type BuildMode = "package" | "ai";

/**
 * The FULL aerial measurement report for this address — the one that carries
 * ridge, hip, valley, eave and rake feet (the Instant packs do not). The card
 * shows where it stands and offers the two actions; the data form does them.
 */
export interface ReportProp {
  state: "loading" | "none" | "pending" | "measured";
  reportId?: number | null;
  status?: string | null;
  busy: boolean;
  /** Price, confirm, then place the billed order. */
  onOrder: () => void;
  /** Ask about a pending report and load its lengths if it has landed. */
  onCheck: () => void;
}

export interface BuildEstimateCardProps {
  /** A free aerial estimate: its figures can't be priced — the card says so and shows no builder. */
  isRecon: boolean;
  /** Roof size feeding the takeoff, in squares (1 square = 100 sq ft). null before any measurement. */
  squares: number | null;
  /** The contractor typed the takeoff (squares + pitch) instead of measuring. */
  manual: { squares: number; pitchLabel: string } | null;
  /** How the estimate gets built. Both paths fill the same tables. */
  buildMode: BuildMode;
  onBuildMode: (mode: BuildMode) => void;
  /** AI path only: waste factor for the one-shot draft. */
  waste: number;
  onWaste: (pct: number) => void;
  wasteOptions: readonly number[];
  /** The aerial data carried no pitch, so the contractor states one before
   *  anything is priced. null = not needed for this roof. */
  pitchEntry: { value: string | null; onChange: (pitch: string | null) => void; options: readonly string[] } | null;
  /** AI path: the "Generate estimate" action. `reason` explains a disabled button. */
  generate: { busy: boolean; disabled: boolean; reason?: string; onClick: () => void };
  /** A data-quality caution that blocks nothing: the figures may be an
   *  outbuilding's, or short a structure. The card says so beside the
   *  controls, with the one-click way out when there is one. Absent = the
   *  figures are fine. */
  caution?: { stamp: string; text: string; action?: { label: string; onClick: () => void } } | null;
  /** Package path: what the builder prices from. null = nothing to price yet. */
  facts: RoofFacts | null;
  /** The full measurement report's state for this address; absent = not offered. */
  report?: ReportProp | null;
  builderDisabled: boolean;
  converting: boolean;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  /** The estimate tables (Materials, Labor, assumptions, total, Convert) once
   *  lines exist. The data form renders them; the card only places them. The
   *  node carries `.is-hidden` until `hasEstimate`. */
  output: ReactNode;
  hasEstimate: boolean;
}
