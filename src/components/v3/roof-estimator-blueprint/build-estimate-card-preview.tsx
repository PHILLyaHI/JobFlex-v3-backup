"use client";

// Design preview for the "Build an estimate" card, at
// /dashboard/roof-estimator/card-preview?builder=<variant>.
//
// The card only mounts on the real page after a measurement, and a
// measurement spends an aerial lookup. Here the SAME card switch is fed a
// sample house instead, inside the same shell and page styles, so a card
// variant can be seen and clicked for free. Build fills the same Materials /
// Labor tables the data form renders; nothing is saved, and Convert, Generate
// and the report order only show a toast.
//
//   ?state=caution  the "check roof area" warning (wrong building)
//   ?state=pitch    the aerial data carried no pitch: the card asks for one
//   ?state=waiting  the pitch and details are still on their way
//   ?state=recon    a free aerial estimate: nothing can be priced

import * as React from "react";
import { nanoid } from "nanoid";
import { useSearchParams } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import type { RoofFacts, RoofPackage } from "@/lib/roofPackage/takeoff";
import { WASTE_OPTIONS } from "@/lib/roofPackage/catalog";
import type { BuildMode } from "./build-estimate-card";
import { BuildEstimateCardSwitch } from "./build-estimate-card-switch";
import { EstimateLinesTable, type EditableLine } from "./estimate-lines-table";
import { RoofEstimatorSprite } from "./sprite";

const PITCHES = ["2/12", "3/12", "4/12", "5/12", "6/12", "7/12", "8/12", "9/12", "10/12", "12/12"];

const SAMPLE_FACTS: RoofFacts = {
  squares: 24.2,
  squaresBasis: "measured",
  pitchFamilies: [
    { pitch12: 6, share: 0.7 },
    { pitch12: 10, share: 0.3 },
  ],
  pitchBasis: "measured",
  perimeterFt: 232,
  footprintSqft: 2050,
  chimney: true,
  rooftopAcCount: 0,
  shape: "hip",
  facetCount: 8,
  measured: null,
  existingMaterial: "Asphalt shingle",
  facetConfidence: 0.8,
  buildingUse: null,
  storeys: 2,
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const toLine = (l: RoofPackage["materials"][number]): EditableLine => ({
  id: nanoid(6),
  name: l.name,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  unit: l.unit,
  basis: l.basis,
});
const sum = (rows: EditableLine[]) => rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

export function BuildEstimateCardPreview() {
  const state = useSearchParams()?.get("state") ?? "";
  const [buildMode, setBuildMode] = React.useState<BuildMode>("package");
  const [waste, setWaste] = React.useState(12);
  const [pitch, setPitch] = React.useState<string | null>(null);
  const [buildingUse, setBuildingUse] = React.useState<"residential" | "commercial" | null>(null);
  const [materials, setMaterials] = React.useState<EditableLine[]>([]);
  const [labor, setLabor] = React.useState<EditableLine[]>([]);
  const [assumptions, setAssumptions] = React.useState<string[]>([]);

  const needsPitch = state === "pitch";
  const pitch12 = pitch ? Number(pitch.split("/")[0]) : null;
  const facts: RoofFacts = {
    ...SAMPLE_FACTS,
    ...(state === "caution" ? { squares: 1.2, facetCount: null, perimeterFt: null, footprintSqft: 122 } : null),
    ...(needsPitch
      ? { pitchFamilies: pitch12 ? [{ pitch12, share: 1 }] : [], pitchBasis: pitch12 ? ("entered" as const) : null }
      : null),
    buildingUse,
  };
  const hasEstimate = materials.length + labor.length > 0;
  const noPitch = needsPitch && !pitch;

  const preview = (what: string) => toast.info("Preview only", `${what} does nothing on this sample page.`);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Design preview · sample 24-square house</div>
          <h1 className="page-title">Build card preview</h1>
        </div>
      </div>

      <BuildEstimateCardSwitch
        isRecon={state === "recon"}
        squares={facts.squares}
        manual={null}
        buildMode={buildMode}
        onBuildMode={setBuildMode}
        waste={waste}
        onWaste={setWaste}
        wasteOptions={WASTE_OPTIONS}
        waiting={state === "waiting" ? "Still reading the pitch and details." : null}
        pitchEntry={needsPitch ? { value: pitch, onChange: setPitch, options: PITCHES } : null}
        generate={{
          busy: false,
          disabled: state === "recon" || state === "waiting" || noPitch,
          reason: state === "waiting" ? "Still reading the pitch and details." : noPitch ? "Enter the pitch first — the measurement has none for this roof." : undefined,
          onClick: () => preview("Generate estimate"),
        }}
        caution={
          state === "caution"
            ? {
                stamp: "Check roof area",
                text: "Aerial report: 122 sq ft · Google: 4,126 sq ft. Confirm the roof before pricing.",
                action: { label: "Use Google area & enter pitch", onClick: () => preview("Use Google area") },
              }
            : null
        }
        facts={state === "recon" ? null : facts}
        onBuildingUse={setBuildingUse}
        report={
          state === "recon"
            ? null
            : { state: "none", reportId: null, status: null, busy: false, onOrder: () => preview("Order report"), onCheck: () => preview("Check report") }
        }
        builderDisabled={false}
        converting={false}
        onBuild={(pkg) => {
          setMaterials(pkg.materials.map(toLine));
          setLabor(pkg.labor.map(toLine));
          setAssumptions(pkg.assumptions);
        }}
        onConvert={() => preview("Convert to proposal")}
        hasEstimate={hasEstimate}
        output={
          <div className={"build-out" + (hasEstimate ? "" : " is-hidden")} id="buildOut">
            {hasEstimate && (
              <>
                <EstimateLinesTable title="Materials" rows={materials} onChange={setMaterials} addLabel="Add material" />
                <EstimateLinesTable title="Labor" rows={labor} onChange={setLabor} addLabel="Add labor" />
                {assumptions.length > 0 && (
                  <div className="bo-assume">
                    <span className="kpi-lbl">Assumptions</span>
                    <ul>
                      {assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="bo-total">
                  <span className="kpi-lbl">Estimate total</span>
                  <span className="bo-total-v">{money(sum(materials) + sum(labor))}</span>
                  <span className="bo-total-acts">
                    <button className="btn btn-primary btn--sm" type="button" id="convertBtn" onClick={() => preview("Convert to proposal")}>
                      <svg className="ic">
                        <use href="#i-file" />
                      </svg>
                      Convert to proposal
                    </button>
                  </span>
                </div>
              </>
            )}
          </div>
        }
      />

      <RoofEstimatorSprite />
    </>
  );
}
