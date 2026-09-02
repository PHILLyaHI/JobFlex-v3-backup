"use client";

// Blueprint roof estimator — page CONTENT.
//
// HISTORY. The donor's markup (intake / measuring / report / build) shipped
// first, filled from a hand-authored fixture. On 2026-07-30 it was replaced by
// a mount of the classic RoofEstimatorForm, so the page stopped looking like
// the donor. Since 2026-08-23 the donor markup is back, in
// roof-estimator-blueprint-form.tsx — now driven by the EagleView measurement
// engine (evRoofModel / reconRoofPreview / order flow) with its 2D/3D viewers.
//
// It is mounted as an ordinary React child, NOT through
// blueprint-shell/react-island: the shell renders `.content`'s children from
// the App Router tree, so a child here keeps the router context the form needs
// (`useRouter()` for the redirect after "Convert to proposal").
//
// `roof-estimator-behavior` is page-level motion only (the reveal cascade and
// the press effect) — every interaction on this page belongs to the form.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initRoofEstimatorContent } from "./roof-estimator-behavior";
import { RoofEstimatorBlueprintForm } from "./roof-estimator-blueprint-form";
import { RoofEstimatorSprite } from "./sprite";

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
        {/* The donor's "Measure another" action. The form portals the button in
            here so the page head and the panel state share one source. */}
        <div className="page-actions" id="rfAgainHost" />
      </div>

      {evEnabled ? (
        <RoofEstimatorBlueprintForm aiEnabled={aiEnabled} />
      ) : (
        <div className="card rf-card">
          <div className="rf-body">
            <div className="card-title">EagleView isn’t configured.</div>
            <p className="rf-note">
              Set <code>EAGLEVIEW_CLIENT_ID</code> and <code>EAGLEVIEW_CLIENT_SECRET</code> in{" "}
              <code>.env.local</code> to enable roof measurement.
            </p>
          </div>
        </div>
      )}

      <RoofEstimatorSprite />
    </>
  );
}
