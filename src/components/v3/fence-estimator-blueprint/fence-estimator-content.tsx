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

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initFenceEstimatorContent } from "./fence-estimator-behavior";
import { Sprite } from "./sprite";

export function FenceEstimatorContent() {
  // "Convert to proposal" creates a real proposal and has to land on it. A
  // behavior module is plain DOM with no React tree, so the only client-side
  // router on this page is the one THIS component can hold — it is handed down
  // as a callback, the same direction every other island prop travels.
  //
  // Through a ref, NOT the callback's deps: `useBlueprintContent` re-runs
  // whenever `init` changes identity, and a re-run tears the page down and
  // replays the whole reveal cascade. The ref is kept current so the behavior
  // module can never navigate with a stale router, while `init` stays
  // referentially stable for the life of the mount. (Same latest-ref pattern
  // FenceDrawMap uses for its own callback props.)
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const init = useCallback(
    (content: HTMLElement) =>
      initFenceEstimatorContent(content, {
        navigate: (href) => routerRef.current.push(href as Route),
      }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Automation · Estimating</div>
          <h1 className="page-title">Fence studio</h1>
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
          {/* The property lines load themselves the moment an address resolves —
              there is nothing left to ask for. This button is the NEXT step:
              lay fence along the checked sides of the lot. It ADDS to whatever
              is already traced; nothing drawn by hand is replaced. */}
          <button className="btn btn-ghost btn--sm" type="button" id="fenceBtn" disabled>
            <svg className="ic">
              <use href="#i-pen" />
            </svg>
            Put down the fence
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
              {/* `data-act` drives the map's align MODE; `data-flash` is the
                  fallback tick for when no map surface is mounted. */}
              <button className="tool" type="button" data-act="align" data-flash="Aligned">
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
              {/* ReportAll raster boundary layer — every neighbouring lot's
                  line-work. Off by default: the tile quota is ALLTIME, so the
                  layer is spent deliberately, not on page load. */}
              <button className="tool" type="button" data-act="lot-lines" aria-pressed="false">
                <svg className="ic">
                  <use href="#i-grid" />
                </svg>
                Lot lines
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

          {/* STAGE. The map slot opens on a PROMPT, not on a map: the surface
              used to mount straight away on a default lot in Texas, so the page
              greeted every visitor with somebody else's house. The behavior
              module mounts the live surface only once an address resolves, and
              swaps this copy for the "no browser key" failure when there is no
              key to mount with. */}
          <div className="stage-canvas" id="stageCanvas">
            <div className="map-slot" id="mapSlot">
              <div className="map-slot-in">
                <svg className="ic">
                  <use href="#i-pin" />
                </svg>
                <div className="ms-t">Enter the address</div>
                <div className="ms-h">Search the property above. The satellite view opens on that
                  lot and its property lines load with it — until then there is no site to trace.</div>
              </div>
            </div>
            <div className="model-slot is-hidden" id="stage3d">
              <div className="map-slot-in">
                <svg className="ic">
                  <use href="#i-box" />
                </svg>
                <div className="ms-t">Nothing traced yet</div>
                <div className="ms-h">The 3D preview is built from the traced run. Draw the fence on
                  the map and it renders here.</div>
              </div>
            </div>
            <div className="stage-zoom">
              <button className="zoom-btn" type="button" data-zoom="1" data-flash-icon="" aria-label="Zoom in">+</button>
              <button className="zoom-btn" type="button" data-zoom="-1" data-flash-icon="" aria-label="Zoom out">−</button>
            </div>
          </div>

          <div className="stage-hint">Click to trace — dots magnet when close (close / connect) · right-click to stop ·
            after stopping, click open ground to start a separate fence · right-click a dot to remove</div>

          {/* PARCEL SIDES. Filled by the behavior module when /api/parcels
              returns the property for the searched address: one checkbox row per
              boundary side, hover highlights that side on the map, and "Put down
              the fence" (top bar) lays fence along the CHECKED sides. Hidden
              until a parcel exists — an empty panel would advertise a lookup
              that has not happened.

              A property recorded as MORE THAN ONE LOT (two deeds bought
              together) lists every lot's sides here, under its own heading —
              there is no "which one" to pick, because the fence goes round the
              land, not round a deed. */}
          <div className="parcel-panel is-hidden" id="parcelPanel">
            <div className="parcel-head">
              <div>
                <div className="kpi-lbl">Property sides</div>
                <div className="parcel-meta" id="parcelMeta"></div>
              </div>
              <div className="parcel-sum" id="parcelSum">0 ft checked</div>
            </div>
            <ul className="parcel-sides" id="parcelSides"></ul>
          </div>
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
            {/* Same empty-state idiom as #openEmpty below. The page opens with
                NO runs: every foot in the ledger is either traced on the map or
                typed by the user, so nothing on the ticket is invented. */}
            <div className="open-empty" id="runsEmpty">Enter the address above and trace the fence on the map, or add a run and type its length.</div>
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
            {/* The rate card is a starting point, not a quote: a contractor who
                prices cedar at $34 says so BY EDITING CEDAR — click the figure
                on the row and type. There is no separate rate box any more; a
                second place to set a price is a second price to disagree with
                the one on the row. Materials of your own are added here too. */}
            <div className="ledger-head">Material</div>
            <ul className="mats" id="matList"></ul>
            <div className="mats-add">
              <button className="btn btn-ghost btn--sm" type="button" id="matAdd">
                <svg className="ic">
                  <use href="#i-plus" />
                </svg>
                Add material
              </button>
            </div>
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
