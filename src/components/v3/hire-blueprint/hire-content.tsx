"use client";

// Blueprint hire — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar, sprite and graph-paper field come from the
// shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#hubDoors, #tallyRow, #hubList, #hkBoard and
// #sheetBody) are left empty exactly like the donor and filled by the ported
// script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural note: in the donor, `#sheetBg` / `#sheet` sit OUTSIDE
// `.content` (children of `.layout`, which the shared shell owns here), so
// they ship as the last members of this fragment instead. Both are
// `position: fixed`, so they take no part in `.content`'s flex flow; the
// stacking consequence of moving them inside a `z-index: 1` ancestor is
// undone by the one escape-hatch rule in hire-global.css, and the reveal
// cascade skips them in hire-behavior.ts — together those reproduce the
// donor's paint order and motion exactly.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initHireContent } from "./hire-behavior";
import "./hire-global.css";

export function HireContent() {
  useBlueprintContent(initHireContent);

  return (
    <>
      {/* ===== ROUTE: /dashboard/hire/hub ===== */}
      <section className="ppanel" data-panel="hub">
        <div className="page-head">
          <div>
            <div className="kicker">Marketplace</div>
            <h1 className="page-title">Hire &amp; Work</h1>
          </div>
          <div className="page-actions">
            <span className="pstatus hub-flag">
              <span className="hub-dot"></span>Preview
            </span>
          </div>
        </div>

        {/* two doors in one card, split by a hairline */}
        <div className="card hub-doors" id="hubDoors"></div>

        {/* Your activity */}
        <div className="card hub-tally">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Your activity</div>
            </div>
            <button className="hub-viewall" type="button" data-flash-door="">
              View all{" "}
              <svg className="ic">
                <use href="#i-arrow" />
              </svg>
            </button>
          </div>
          <div className="tally-row" id="tallyRow"></div>
        </div>

        {/* Go deeper */}
        <div className="card hub-links">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Go deeper</div>
            </div>
          </div>
          <ul className="hub-list" id="hubList"></ul>
        </div>
      </section>

      {/* ===== ROUTE: /dashboard/hire (applicant pipeline) ===== */}
      <section className="ppanel is-hidden" data-panel="pipeline">
        <button className="back-link" type="button" data-goto="hub">
          <svg className="ic rot-l">
            <use href="#i-chev" />
          </svg>
          Hire &amp; Work
        </button>
        <div className="page-head">
          <div>
            <div className="kicker">Workforce</div>
            <h1 className="page-title">Hire</h1>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" id="addApplicantBtn">
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              Add applicant
            </button>
          </div>
        </div>

        <div className="hk-board" id="hkBoard"></div>
        <div className="pempty is-hidden" id="hkEmpty">
          <b>No applicants yet</b>
          <br />
          Add candidates manually or wire your job-board integrations later.
          <div style={{ marginTop: "14px" }}>
            <button className="btn btn-primary btn--sm" type="button" data-act="add">
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              Add first applicant
            </button>
          </div>
        </div>
      </section>
      <div className="pmenu" id="pMenu"></div>

      {/* Candidate panel — donor overlays, fixed to the viewport */}
      <div className="sheet-bg" id="sheetBg"></div>
      <aside className="sheet" id="sheet">
        <div className="sheet-head">
          <div className="sheet-title" id="sheetTitle">
            —
          </div>
          <button className="sheet-x" type="button" data-sheet="close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body" id="sheetBody"></div>
      </aside>
    </>
  );
}
