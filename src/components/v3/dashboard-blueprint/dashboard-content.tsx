"use client";

// Blueprint dashboard — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar, sprite and graph-paper field come from the
// shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#weekStrip, #weekList, #jobsList, #actList, the
// chart groups, the stage columns) are left empty exactly like the donor and
// filled by the ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// Nothing on this sheet is a fixture any more: `data` is the org's real
// aggregates, read in src/app/dashboard/page.tsx.

import { useCallback, useRef } from "react";
import Link from "next/link";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initDashboardContent } from "./blueprint-behavior";
import type { DashboardData } from "./blueprint-data";

export function DashboardContent({ data }: { data: DashboardData }) {
  // The server rows reach `init` through a ref, NOT through the callback's
  // deps. `useBlueprintContent` re-runs whenever `init` changes identity, and a
  // re-run tears the page down and replays the whole reveal cascade — so the
  // init has to stay referentially stable for the life of the mount. The ref is
  // seeded on the first render and never written again; a navigation away
  // unmounts the page, so the next visit gets freshly-queried rows.
  const seedRef = useRef(data);

  const init = useCallback((content: HTMLElement) => initDashboardContent(content, seedRef.current), []);
  useBlueprintContent(init);

  return (
    <>
      {/* LEAD CENTER BANNER — only for an org that cannot receive platform
          leads yet. The behavior module fills the missing-piece phrase and
          honours the 7-day localStorage snooze the classic banner wrote. */}
      {data.leadProfile && (
        <div className="banner" id="leadBanner">
          <svg className="ic banner-pin">
            <use href="#i-pin" />
          </svg>
          <div className="banner-body">
            <div className="banner-kicker">Lead Center</div>
            <div className="banner-txt">
              Homeowner leads near you aren&apos;t reaching your shop yet — add{" "}
              <span id="bannerMissing"></span> to start receiving them.{" "}
              <Link className="banner-link" href="/dashboard/company">
                Complete your profile
              </Link>
            </div>
          </div>
          <button className="banner-close" type="button" aria-label="Dismiss for a week">
            <svg className="ic">
              <use href="#i-x" />
            </svg>
          </button>
        </div>
      )}

      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker" id="greetKicker"></div>
          <h1 className="page-title">Overview</h1>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" href="/dashboard/advanced-ai">
            <svg className="ic">
              <use href="#i-bulb" />
            </svg>
            Smart Proposal
          </Link>
          <Link className="btn btn-ghost" href="/dashboard/proposals/new">
            <svg className="ic">
              <use href="#i-file" />
            </svg>
            Manual proposal
          </Link>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-lbl">Revenue · 30D</div>
          <div className="kpi-val" id="kpiRevenue"></div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Pipeline Value</div>
          <div className="kpi-val" id="kpiPipeline"></div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Open Proposals</div>
          <div className="kpi-val accent" id="kpiOpen"></div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">New Leads · 7D</div>
          <div className="kpi-val" id="kpiLeads"></div>
        </div>
      </div>

      {/* REVENUE TREND + RECENT ACTIVITY */}
      <div className="grid-23">
        <div className="card card--chart" id="chartCard">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Revenue Trend</div>
            </div>
            <div className="dd" id="rangeDd">
              <button className="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span className="dd-label">Last 7 Days</span>
                <svg className="ic">
                  <use href="#i-chev" />
                </svg>
              </button>
              <div className="dd-menu" role="listbox">
                {/* `aria-selected` is REQUIRED on role="option" — without it a
                    screen reader announces three ranges and cannot say which one
                    the chart is currently drawing. It mirrors the `.active`
                    class, and initDropdown keeps the two in step on every pick. */}
                <button className="dd-item active" type="button" role="option" aria-selected="true" data-range="7d">
                  Last 7 Days
                </button>
                <button className="dd-item" type="button" role="option" aria-selected="false" data-range="30d">
                  Last 30 Days
                </button>
                <button className="dd-item" type="button" role="option" aria-selected="false" data-range="90d">
                  Last 90 Days
                </button>
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <svg viewBox="0 0 860 332" role="img" id="revChart" aria-label="Revenue trend for the last 7 days">
              <defs>
                <pattern id="mm" x="70" y="16" width="22.5" height="22.67" patternUnits="userSpaceOnUse">
                  <path d="M 22.5 0 L 0 0 0 22.67" className="ch-minor" fill="none" />
                </pattern>
              </defs>
              <rect x="70" y="16" width="720" height="272" fill="url(#mm)" />
              {/* main grid horizontals */}
              <line x1="70" y1="16" x2="790" y2="16" className="ch-major" />
              <line x1="70" y1="84" x2="790" y2="84" className="ch-major" />
              <line x1="70" y1="152" x2="790" y2="152" className="ch-major" />
              <line x1="70" y1="220" x2="790" y2="220" className="ch-major" />
              {/* axes */}
              <line x1="70" y1="16" x2="70" y2="288" className="ch-axis" />
              <line x1="70" y1="288" x2="790" y2="288" className="ch-axis" />
              <g id="chY"></g>
              <g id="chX"></g>
              <g id="chData"></g>
              <g id="chHover"></g>
            </svg>
          </div>
        </div>

        <div className="card card--flex" id="actCard">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Recent Activity</div>
            </div>
          </div>
          <hr className="card-rule" />
          <div className="list list--fill" id="actList"></div>
        </div>
      </div>

      {/* THIS WEEK + UPCOMING JOBS */}
      <div className="grid-11">
        <div className="card" id="weekCard">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">This Week</div>
              <div className="card-sub" id="weekRange"></div>
            </div>
          </div>
          <div className="week-strip" id="weekStrip"></div>
          <div className="list" id="weekList"></div>
        </div>

        <div className="card" id="jobsCard">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Upcoming Jobs</div>
              <div className="card-sub">Next installs on the calendar</div>
            </div>
          </div>
          <hr className="card-rule" />
          <div className="list list--fill" id="jobsList"></div>
        </div>
      </div>

      {/* PIPELINE / LEAD FLOW */}
      <div className="section-head">
        <div>
          <h2 className="section-title">Lead Flow</h2>
        </div>
        <Link className="card-link" href="/dashboard/leads">
          Open leads
          <svg className="ic">
            <use href="#i-arrow" />
          </svg>
        </Link>
      </div>

      <div className="stage-board">
        <div className="stage-col" data-stage="new">
          <div className="stage-col-head"><span className="stage-dot"></span><span className="stage-lbl">New</span><span className="stage-count">0</span></div>
          <div className="stage-cards"></div>
        </div>
        <div className="stage-col" data-stage="routed">
          <div className="stage-col-head"><span className="stage-dot"></span><span className="stage-lbl">Routed</span><span className="stage-count">0</span></div>
          <div className="stage-cards"></div>
        </div>
        <div className="stage-col" data-stage="claimed">
          <div className="stage-col-head"><span className="stage-dot"></span><span className="stage-lbl">Claimed</span><span className="stage-count">0</span></div>
          <div className="stage-cards"></div>
        </div>
        <div className="stage-col" data-stage="contacted">
          <div className="stage-col-head"><span className="stage-dot"></span><span className="stage-lbl">Contacted</span><span className="stage-count">0</span></div>
          <div className="stage-cards"></div>
        </div>
        <div className="stage-col" data-stage="quoted">
          <div className="stage-col-head"><span className="stage-dot"></span><span className="stage-lbl">Quoted</span><span className="stage-count">0</span></div>
          <div className="stage-cards"></div>
        </div>
      </div>

      {/* A refused stage move has no dialog of its own to speak through. Fixed,
          so the reason is on screen wherever the board was scrolled to. The
          reveal cascade skips it for the same reason it skips `.mdl`: a
          display:none element never intersects, so it would be stranded at
          opacity 0 the first time it was shown. */}
      <div className="d-toast is-hidden" id="dToast" role="alert" aria-live="assertive">
        <svg className="ic"><use href="#i-ban" /></svg>
        <span id="dToastText"></span>
        <button className="d-toast-x" type="button" data-toast="close" aria-label="Dismiss">
          <svg className="ic"><use href="#i-x" /></svg>
        </button>
      </div>
    </>
  );
}
