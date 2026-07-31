"use client";

// Blueprint roof estimator — page CONTENT.
//
// WHAT CHANGED (2026-07-30): this page used to render the donor's own intake /
// measuring / report / build markup and fill it from `roof-estimator-data.ts`,
// a hand-authored demo fixture that `roof-model-adapter.ts` re-expressed as a
// RoofModel for the two viewers. Nothing was ever measured: the samples were
// labels, the facet figures were constants, and every value reset on
// navigation. Mounting the real viewers on top of that fixture made it LOOK
// measured, which is worse than obviously fake.
//
// The whole flow already exists and works at /dashboard/advanced-ai/roof:
// RoofEstimatorForm (components/estimator/roof) owns address → EagleView
// measurement (evRoofModel / evPriceRoof / evOrderRoof / evReportStatus) → 2D
// wireframe + 3D model → facet table → estimateRoof → convert to proposal. So
// this page mounts THAT, and the blueprint work is the skin around and inside
// it (roof-estimator.module.css, the `.rfx` section).
//
// It is mounted as an ordinary React child, NOT through
// blueprint-shell/react-island: the shell renders `.content`'s children from
// the App Router tree, so a child here keeps the router context the form needs
// (`useRouter()` for the redirect after "Convert to proposal" — a detached
// createRoot has no AppRouterContext and throws "invariant expected app router
// to be mounted" on first render). An island is for regions the BEHAVIOR module
// builds; this region is markup, so markup is the cheaper mechanism.
//
// `roof-estimator-behavior` is now only page-level motion (the reveal cascade
// and the press effect) — every interaction on this page belongs to the mounted
// form.

import { RoofEstimatorForm } from "@/components/estimator/roof/RoofEstimatorForm";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initRoofEstimatorContent } from "./roof-estimator-behavior";

export function RoofEstimatorContent({
  evEnabled,
  aiEnabled,
}: {
  /** EagleView credentials present — read on the server, in page.tsx. */
  evEnabled: boolean;
  /** OpenAI key present; without it the estimate generator returns a sample. */
  aiEnabled: boolean;
}) {
  useBlueprintContent(initRoofEstimatorContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation · Measurement</div>
          <h1 className="page-title">Roof estimator</h1>
        </div>
      </div>

      {/* The donor's "Measure another" page action is not restated here: the
          form collapses its own intake into an address strip that carries that
          button, so a second one would be a control with no state to read.

          `.rfx` is the mount point AND the style scope — every blueprint rule
          for the form's interior hangs off it, and the donor's `* { margin: 0;
          padding: 0 }` reset is scoped AWAY from it (see the module CSS), since
          that reset out-specifies every Tailwind spacing utility inside. */}
      <section className="rfx">
        <RoofEstimatorForm evEnabled={evEnabled} aiEnabled={aiEnabled} />
      </section>
    </>
  );
}
