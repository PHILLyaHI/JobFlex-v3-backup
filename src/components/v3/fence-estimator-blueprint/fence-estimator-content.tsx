"use client";

// Blueprint fence estimator ("Fence studio") — page CONTENT only. The donor's
// `.content` children, verbatim (jobflex-fence-estimator-blueprint_7.html); the
// sidebar, topbar, graph-paper field and the 42 shared sprite symbols come from
// the shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#tkLines, #statStrip, #runsList, #openList,
// #matList, #heights, #popGate, #popDoor and #pMenu) are left empty exactly
// like the donor and filled by the ported script on mount — same architecture,
// same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// The local <Sprite /> adds only the two symbols the shell does not carry
// (i-door-open / i-door-closed). It renders last and is a 0×0
// `position: absolute` <svg>, so it takes no space in the `.content` flex
// column and contributes no `gap`.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initFenceEstimatorContent } from "./fence-estimator-behavior";
import { Sprite } from "./sprite";

export function FenceEstimatorContent() {
  useBlueprintContent(initFenceEstimatorContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation · Estimating</div>
          <h1 className="page-title">Fence studio</h1>
          <p className="fs-lede">Swap materials, heights, and gates and watch the estimate update live.</p>
        </div>
      </div>

      {/* TOP BAR */}
      <div className="fs-bar">
        <label className="fs-search">
          <svg className="ic">
            <use href="#i-pin" />
          </svg>
          <input type="text" id="addrInput" placeholder="Search an address…" autoComplete="off" />
          <button className="fs-find" type="button" id="findBtn">
            <svg className="ic">
              <use href="#i-search" />
            </svg>
            Find
          </button>
        </label>
        <div className="fs-bar-r">
          <button className="btn btn-ghost btn--sm" type="button" id="parcelBtn">
            <svg className="ic">
              <use href="#i-board" />
            </svg>
            Load property lines
          </button>
          <div className="vsw" id="modeSwitch">
            <button className="vsw-btn active" type="button" data-mode="draw">
              <svg className="ic">
                <use href="#i-pen" />
              </svg>
              Draw
            </button>
            <button className="vsw-btn" type="button" data-mode="3d">
              <svg className="ic">
                <use href="#i-box" />
              </svg>
              3D
            </button>
          </div>
          <button className="btn btn-ghost btn--sm" type="button" id="resetBtn">
            <svg className="ic">
              <use href="#i-undo" />
            </svg>
            Reset
          </button>
        </div>
      </div>

      <div className="fs-grid">
        {/* CANVAS: map (Google Maps slot) / 3D */}
        <div className="card fs-stage">
          <div className="stage-tools">
            <div className="tool-group">
              <button className="tool" type="button" data-flash="Aligned">
                <svg className="ic">
                  <use href="#i-grid" />
                </svg>
                Align
              </button>
              <button className="tool" type="button" data-act="close-loop">
                <svg className="ic">
                  <use href="#i-undo" />
                </svg>
                Close loop
              </button>
              <button className="tool" type="button" data-act="undo">
                <svg className="ic">
                  <use href="#i-undo" />
                </svg>
                Undo
              </button>
              <button className="tool" type="button" data-act="clear">
                <svg className="ic">
                  <use href="#i-trash" />
                </svg>
                Clear
              </button>
            </div>
            <div className="tool-group">
              <div className="tool-menu">
                <button className="tool" type="button" data-menu="gate">
                  <svg className="ic">
                    <use href="#i-door-open" />
                  </svg>
                  Gate
                  <svg className="ic caret">
                    <use href="#i-chev" />
                  </svg>
                </button>
                <div className="tool-pop" id="popGate"></div>
              </div>
              <div className="tool-menu">
                <button className="tool" type="button" data-menu="door">
                  <svg className="ic">
                    <use href="#i-door-closed" />
                  </svg>
                  Door
                  <svg className="ic caret">
                    <use href="#i-chev" />
                  </svg>
                </button>
                <div className="tool-pop" id="popDoor"></div>
              </div>
            </div>
          </div>

          {/* EMPTY MAP SLOT */}
          <div className="stage-canvas" id="stageCanvas">
            <div className="map-slot" id="mapSlot">
              <div className="map-slot-in">
                <svg className="ic">
                  <use href="#i-pin" />
                </svg>
                <div className="ms-t">Map surface</div>
                <div className="ms-h">Google Maps API key goes here — the traced run, parcel lines
                  and gate pins render on this layer.</div>
              </div>
            </div>
            <div className="model-slot is-hidden" id="stage3d">
              <div className="map-slot-in">
                <svg className="ic">
                  <use href="#i-box" />
                </svg>
                <div className="ms-t">3D preview</div>
                <div className="ms-h">Scene mounts here — the traced run, panels, posts and openings
                  render live from the ledger.</div>
              </div>
            </div>
            <div className="stage-zoom">
              <button className="zoom-btn" type="button" data-flash-icon="" aria-label="Zoom in">+</button>
              <button className="zoom-btn" type="button" data-flash-icon="" aria-label="Zoom out">−</button>
            </div>
          </div>

          <div className="stage-hint">Click to trace — dots magnet when close (close / connect) · right-click to stop ·
            after stopping, click open ground to start a separate fence · right-click a dot to remove</div>
        </div>

        {/* RIGHT RAIL */}
        <aside className="fs-rail">
          <div className="card tk">
            <div className="tk-body">
              <div className="kpi-lbl">Estimated total</div>
              <div className="tk-total" id="tkTotal">—</div>
              <div className="tk-sub" id="tkSub">—</div>
              <ul className="tk-lines" id="tkLines"></ul>
              <button className="btn btn-primary" id="convertBtn">
                <svg className="ic">
                  <use href="#i-file" />
                </svg>
                Convert to proposal
              </button>
            </div>
          </div>

          <div className="card fs-card">
            <div className="stat-strip" id="statStrip"></div>
            <div className="ledger-head">Runs</div>
            <ul className="runs" id="runsList"></ul>
            <div className="runs-add">
              <button className="btn btn-ghost btn--sm" type="button" data-act="add-run">
                <svg className="ic">
                  <use href="#i-plus" />
                </svg>
                Add run
              </button>
            </div>
            <div className="ledger-head">Gates &amp; doors</div>
            <ul className="openings" id="openList"></ul>
            <div className="open-empty is-hidden" id="openEmpty">No openings yet — add a gate or door above.</div>
          </div>

          <div className="card fs-card">
            <div className="ledger-head">Material</div>
            <ul className="mats" id="matList"></ul>
            <div className="ledger-head">Height</div>
            <div className="seg" id="heights"></div>
            <div className="ledger-head">Site</div>
            <div className="site-row">
              <div>
                <div className="tg-t">Remove existing fence</div>
                <div className="tg-h">Teardown and haul, per linear foot.</div>
              </div>
              <button className="tgl" type="button" id="demoTgl" aria-label="Remove existing fence"></button>
            </div>
          </div>
        </aside>
      </div>
      <div className="pmenu" id="pMenu"></div>

      <Sprite />
    </>
  );
}
