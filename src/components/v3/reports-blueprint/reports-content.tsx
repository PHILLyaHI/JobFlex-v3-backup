"use client";

// Blueprint reports — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-reports-blueprint.html); the sidebar, topbar, base sprite
// and graph-paper field come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (#ranges, #rangeNote, #summary, #revChart, #funnel, #convBody,
// #crewBody and the export dialog's #expRange / #expList) are left empty
// exactly like the donor and filled by the ported script on mount — same
// architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One RE-LAYOUT (owner request): the donor stacks Revenue full width and then
// pairs Pipeline + Conversion in `.rp-two`. Here Revenue and Conversion share
// one 70/30 row (`.rp-split`) and Pipeline runs full width beneath it. Every
// card's internal markup is the donor's, untouched; only the wrappers and the
// block order changed. The revenue chart's viewBox is retuned for the 70%
// column in reports-behavior.ts → renderChart().
//
// One relocation: the donor parks the export dialog (`.mdl#expMdl`) OUTSIDE
// `.content`, as a direct child of `.layout`. Nothing may be appended to
// document.body from a page module, so it ships as the last block here
// instead; it is `position: fixed`, so DOM order changes nothing visually, and
// reports.module.css restores its stacking with `.content:has(.mdl.open)`.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initReportsContent } from "./reports-behavior";
import type { ReportsRollup } from "./reports-data";
import { ReportsSprite } from "./sprite";

/**
 * @param rollup the org's real aggregates, read in the page's server component
 *   (getReportsRollup). All four ranges are precomputed, so the range chips
 *   switch without a round trip.
 */
export function ReportsContent({ rollup }: { rollup: ReportsRollup }) {
  // The rollup reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. The ref is never
  // written after creation; a navigation away unmounts the component, so the
  // next visit gets a fresh ref holding freshly-queried aggregates.
  const seedRef = useRef(rollup);
  const init = useCallback(
    (content: HTMLElement) => initReportsContent(content, { rollup: seedRef.current }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Analytics</div>
          <h1 className="page-title">Reports</h1>
        </div>
        <div className="page-actions">
          {/* Swap (owner request): the period note holds Export's old slot as
              the page's primary annotation; Export moved into .rp-bar below.
              The behavior module reaches both by id, so nothing there moves. */}
          <div className="range-note" id="rangeNote">—</div>
        </div>
      </div>

      {/* RANGE */}
      <div className="rp-bar">
        <div className="ranges" id="ranges"></div>
        <button className="btn btn-ghost" id="exportBtn">
          <svg className="ic">
            <use href="#i-file" />
          </svg>
          Export
        </button>
      </div>

      {/* SUMMARY */}
      <div className="stat-grid" id="summary"></div>

      {/* REVENUE + CONVERSION — one row, 70 / 30 (see .rp-split) */}
      <div className="rp-split">
        {/* REVENUE */}
        <div className="card rp-card">
          <div className="rp-head">
            <div>
              <div className="card-title">Revenue</div>
              <div className="card-sub">Collected against invoiced, by month.</div>
            </div>
            <div className="rp-legend">
              <span><i className="sw-inv"></i>Invoiced</span>
              <span><i className="sw-col"></i>Collected</span>
            </div>
          </div>
          <div className="rp-chart" id="revChart"></div>
        </div>

        {/* CONVERSION */}
        <div className="card rp-card">
          <div className="rp-head">
            <div>
              <div className="card-title">Conversion</div>
              <div className="card-sub">Quote to close, and how long it takes.</div>
            </div>
          </div>
          <div className="conv-body" id="convBody"></div>
        </div>
      </div>

      {/* FUNNEL — full width */}
      <div className="card rp-card">
        <div className="rp-head">
          <div>
            <div className="card-title">Pipeline</div>
            <div className="card-sub">Where the work falls out.</div>
          </div>
        </div>
        <div className="funnel" id="funnel"></div>
      </div>

      {/* CREWS */}
      <div className="card rp-card">
        <div className="rp-head">
          <div>
            <div className="card-title">Crew performance</div>
            <div className="card-sub">Jobs delivered per person in this range.</div>
          </div>
        </div>
        <table className="ptable rp-table">
          <thead>
            <tr><th>Crew</th><th>Jobs</th><th>Hours</th><th>Revenue</th><th>$/hr</th><th>Rating</th></tr>
          </thead>
          <tbody id="crewBody"></tbody>
        </table>
      </div>
      <div className="pmenu" id="pMenu"></div>

      {/* EXPORT DIALOG — donor markup, moved inside `.content` (see header) */}
      <div className="mdl" id="expMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div className="mdl-title">Export report</div>
            <div className="mdl-sub" id="expRange">—</div>
          </div>
          <div className="mdl-body">
            <div className="exp-list" id="expList"></div>
          </div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">Cancel</button>
            <button className="btn btn-primary btn--sm" type="button" id="downloadBtn">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>

      <ReportsSprite />
    </>
  );
}
