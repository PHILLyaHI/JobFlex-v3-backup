"use client";

// Blueprint roof estimator — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-roof-estimator-blueprint_3.html); the sidebar, topbar, base
// sprite and graph-paper field come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (#samples, the #state option list, #rfHero, #rfCanvas, #rfLegend,
// #lfList, #pmSub / #pmBody / #pmCalls, #buildOut and #pMenu) are left empty
// exactly like the donor and filled by the ported script on mount — same
// architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initRoofEstimatorContent } from "./roof-estimator-behavior";
import { RoofEstimatorSprite } from "./sprite";

export function RoofEstimatorContent() {
  useBlueprintContent(initRoofEstimatorContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation · Measurement</div>
          <h1 className="page-title">Roof estimator</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost is-hidden" type="button" id="againBtn">
            <svg className="ic">
              <use href="#i-roof" />
            </svg>
            Measure another
          </button>
        </div>
      </div>

      {/* ===== INTAKE: order a measurement ===== */}
      <section className="ppanel" data-panel="intake">
        <div className="card rf-card">
          <div className="rf-head">
            <div>
              <div className="card-title">Measure a roof</div>
            </div>
          </div>

          <div className="rf-body">
            <div className="kpi-lbl">Instant samples · no charge</div>
            <div className="samples" id="samples"></div>

            <div className="rf-div">
              <span>Or measure a new address</span>
            </div>

            <p className="rf-note">
              Ordering places a real measurement report. The sandbox account returns a finished
              report in a few seconds instead of hours.
            </p>

            <div className="addr-grid">
              <label className="est-field addr-wide">
                <span className="est-lbl">Address</span>
                <input className="est-in" id="addr" placeholder="4812 Maple Ave" />
              </label>
              <label className="est-field">
                <span className="est-lbl">City</span>
                <input className="est-in" id="city" placeholder="Bothell" />
              </label>
              <label className="est-field est-field--sm">
                <span className="est-lbl">State</span>
                <select className="est-in" id="state"></select>
              </label>
              <label className="est-field est-field--sm">
                <span className="est-lbl">ZIP</span>
                <input className="est-in" id="zip" placeholder="98011" />
              </label>
            </div>

            <div className="rf-actions">
              <button className="btn btn-ghost btn--sm" type="button" id="priceBtn">
                <svg className="ic">
                  <use href="#i-tag" />
                </svg>
                Check report price
              </button>
              <span className="rf-price is-hidden" id="rfPrice"></span>
              <button className="btn btn-primary btn--sm is-hidden" type="button" id="orderBtn">
                <svg className="ic">
                  <use href="#i-check" />
                </svg>
                Order report
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MEASUREMENT IN PROGRESS ===== */}
      <section className="ppanel is-hidden" data-panel="measuring">
        <div className="card rf-card measuring">
          <div className="ms-body">
            <div className="ms-num" id="msReport">#—</div>
            <div className="ms-stage" id="msStage">Ordering report…</div>
            <div className="ms-track">
              <span className="ms-fill" id="msFill"></span>
            </div>
            <div className="ms-hint">
              Measuring the structure, pitch by pitch. This normally takes a few hours — sandbox
              returns in seconds.
            </div>
          </div>
        </div>
      </section>

      {/* ===== RESULT ===== */}
      <section className="ppanel is-hidden" data-panel="report">
        <div className="card rf-hero" id="rfHero"></div>

        <div className="rf-grid">
          <div className="card rf-card rf-viewer">
            <div className="rf-head rf-head--bar">
              <div>
                <div className="card-title" id="vwTitle">Roof plan</div>
                <div className="card-sub" id="vwSub">—</div>
              </div>
              <div className="vw-controls">
                <div className="vsw" id="viewSwitch">
                  <button className="vsw-btn active" type="button" data-view="2d">2D</button>
                  <button className="vsw-btn" type="button" data-view="3d">3D</button>
                </div>
                <div className="vsw" id="labelSwitch">
                  <button className="vsw-btn active" type="button" data-label="shaded">Shaded</button>
                  <button className="vsw-btn" type="button" data-label="pitch">Pitch</button>
                  <button className="vsw-btn" type="button" data-label="area">Area</button>
                  <button className="vsw-btn" type="button" data-label="length">Length</button>
                </div>
              </div>
            </div>
            <div className="rf-canvas" id="rfCanvas"></div>
            <div className="rf-legend" id="rfLegend"></div>
          </div>

          <div className="rf-side">
            <div className="card rf-card">
              <div className="rf-head">
                <div className="card-title">Linear footage</div>
                <div className="card-sub">Edge lengths that drive trim, ridge vent and flashing.</div>
              </div>
              <ul className="lf-list" id="lfList"></ul>
            </div>

            <div className="card rf-card">
              <div className="rf-head">
                <div className="card-title">Pitch mix</div>
                <div className="card-sub" id="pmSub">—</div>
              </div>
              <div className="pm-body" id="pmBody"></div>
              <div className="pm-calls" id="pmCalls"></div>
            </div>
          </div>
        </div>

        <div className="card rf-card rf-build">
          <div className="rf-head rf-head--bar">
            <div>
              <div className="card-title">Build an estimate</div>
              <div className="card-sub">
                Measurements feed the takeoff — adjust waste and price it out.
              </div>
            </div>
            <div className="build-ctl">
              {/* The donor's `<option selected>12%</option>` becomes
                  `defaultValue` on the <select> — React's spelling for the
                  identical initial selection (the options carry no `value`, so
                  their value is their text). */}
              <label className="est-field est-field--sm">
                <span className="est-lbl">Waste factor</span>
                <select className="est-in" id="waste" defaultValue="12%">
                  <option>10%</option>
                  <option>12%</option>
                  <option>15%</option>
                  <option>18%</option>
                </select>
              </label>
              <button className="btn btn-primary btn--sm" type="button" id="buildBtn">
                <svg className="ic">
                  <use href="#i-bulb" />
                </svg>
                Generate estimate
              </button>
            </div>
          </div>
          <div className="build-out is-hidden" id="buildOut"></div>
        </div>
      </section>
      <div className="pmenu" id="pMenu"></div>

      <RoofEstimatorSprite />
    </>
  );
}
