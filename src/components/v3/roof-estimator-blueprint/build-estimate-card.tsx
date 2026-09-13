"use client";

// The "Build an estimate" card of the roof estimator — the card CHROME
// (title, basis line, the Roof package / AI estimate switch, the pitch and
// waste pickers, Generate) around the roof package builder and the estimate
// tables.
//
// Extracted from roof-estimator-data-form.tsx on 2026-09-12 so the card can be
// swapped whole: build-estimate-card-switch.tsx renders this file (the
// incumbent) or one of the from-scratch variants a / b / c by ?builder=. The
// data form keeps every piece of state and passes it down through
// BuildEstimateCardProps; a card owns only markup and CSS.

import * as React from "react";
import type { RoofFacts, RoofPackage, RoofPackageSpec } from "@/lib/roofPackage/takeoff";
import { RoofPackageBuilder } from "./roof-package-builder";

export type BuildMode = "package" | "ai";

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
  builderDisabled: boolean;
  converting: boolean;
  onBuild: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  onConvert: (pkg: RoofPackage, spec: RoofPackageSpec) => void;
  /** The estimate tables (Materials, Labor, assumptions, total, Convert) once
   *  lines exist. The data form renders them; the card only places them. The
   *  node carries `.is-hidden` until `hasEstimate`. */
  output: React.ReactNode;
  hasEstimate: boolean;
}

export function BuildEstimateCard({
  isRecon,
  squares,
  manual,
  buildMode,
  onBuildMode,
  waste,
  onWaste,
  wasteOptions,
  pitchEntry,
  generate,
  facts,
  builderDisabled,
  converting,
  onBuild,
  onConvert,
  output,
}: BuildEstimateCardProps) {
  return (
    <div className="card rf-card rf-build" data-build-card="current">
      <div className="rf-head rf-head--bar">
        <div>
          <div className="card-title">Build an estimate</div>
          <div className="card-sub">
            {isRecon
              ? "These measurements are estimated from aerial imagery, so they can’t be priced. Run Instant measure for this address to build a quote."
              : manual && squares != null
                ? `Priced from your own takeoff — ${squares.toFixed(1)} squares at ${manual.pitchLabel}.`
                : squares != null
                  ? `The measured ${squares.toFixed(1)} squares feed the takeoff.`
                  : "Measurements feed the takeoff."}
            {!isRecon
              ? buildMode === "package"
                ? " Pick what goes on the roof."
                : " The AI drafts a full package from the measured figures; every line stays editable below."
              : ""}
          </div>
        </div>
        <div className="build-ctl">
          <div className="vsw" role="radiogroup" aria-label="How to build the estimate">
            {(["package", "ai"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={buildMode === m}
                className={"vsw-btn" + (buildMode === m ? " active" : "")}
                onClick={() => onBuildMode(m)}
              >
                {m === "package" ? "Roof package" : "AI estimate"}
              </button>
            ))}
          </div>
          {buildMode === "ai" && (
            <label className="est-field est-field--sm">
              <span className="est-lbl">Waste factor</span>
              <span className="bp-sel">
                <select className="bp-sel-in est-in" id="waste" value={waste} onChange={(e) => onWaste(Number(e.target.value))}>
                  {wasteOptions.map((w) => (
                    <option key={w} value={w}>
                      {w}%
                    </option>
                  ))}
                </select>
              </span>
            </label>
          )}
          {pitchEntry && (
            /* EagleView supplied no pitch (pack 002 not bought): the
               contractor states one, and the estimate says so. */
            <label className="est-field est-field--sm">
              <span className="est-lbl">Pitch · enter</span>
              <span className="bp-sel">
                <select
                  className="bp-sel-in est-in"
                  id="pitchEntered"
                  value={pitchEntry.value ?? ""}
                  onChange={(e) => pitchEntry.onChange(e.target.value || null)}
                >
                  <option value="">Select pitch…</option>
                  {pitchEntry.options.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          )}
          {buildMode === "ai" && (
            <button
              className="btn btn-primary btn--sm"
              type="button"
              id="buildBtn"
              disabled={generate.disabled}
              title={generate.reason}
              onClick={generate.onClick}
            >
              <svg className="ic"><use href="#i-bulb" /></svg>
              {generate.busy ? "Generating…" : "Generate estimate"}
            </button>
          )}
        </div>
      </div>
      {buildMode === "package" && facts && !isRecon && (
        <RoofPackageBuilder facts={facts} disabled={builderDisabled} converting={converting} onBuild={onBuild} onConvert={onConvert} />
      )}
      {output}
    </div>
  );
}
