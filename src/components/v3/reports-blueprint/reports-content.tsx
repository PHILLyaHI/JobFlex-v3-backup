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
// One relocation: the donor parks the export dialog (`.mdl#expMdl`) OUTSIDE
// `.content`, as a direct child of `.layout`. Nothing may be appended to
// document.body from a page module, so it ships as the last block here
// instead; it is `position: fixed`, so DOM order changes nothing visually, and
// reports.module.css restores its stacking with `.content:has(.mdl.open)`.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initReportsContent } from "./reports-behavior";
import { ReportsSprite } from "./sprite";

export function ReportsContent() {
  useBlueprintContent(initReportsContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Analytics</div>
          <h1 className="page-title">Reports</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" id="exportBtn">
            <svg className="ic">
              <use href="#i-file" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* RANGE */}
      <div className="rp-bar">
        <div className="ranges" id="ranges"></div>
        <div className="range-note" id="rangeNote">—</div>
      </div>

      {/* SUMMARY */}
      <div className="stat-grid" id="summary"></div>

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

      <div className="rp-two">
        {/* FUNNEL */}
        <div className="card rp-card">
          <div className="rp-head">
            <div>
              <div className="card-title">Pipeline</div>
              <div className="card-sub">Where the work falls out.</div>
            </div>
          </div>
          <div className="funnel" id="funnel"></div>
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
            <tr><th>Crew</th><th className="num">Jobs</th><th className="num">Hours</th><th className="num">Revenue</th><th className="num">$/hr</th><th className="num">Rating</th></tr>
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
