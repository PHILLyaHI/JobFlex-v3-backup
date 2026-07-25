"use client";

// Blueprint dashboard — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar, sprite and graph-paper field come from the
// shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#weekList, #jobsList, #actList, the chart
// groups, the stage columns) are left empty exactly like the donor and filled
// by the ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useEffect } from "react";
import { initDashboardContent } from "./blueprint-behavior";

export function DashboardContent() {
  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".jf-blueprint .content");
    if (!content) return;
    return initDashboardContent(content);
  }, []);

  return (
    <>
      {/* LEAD CENTER BANNER */}
      <div className="banner">
        <svg className="ic banner-pin">
          <use href="#i-pin" />
        </svg>
        <div className="banner-body">
          <div className="banner-kicker">Lead Center</div>
          <div className="banner-txt">
            Homeowner leads near you aren&apos;t reaching your shop yet — add your business
            address and the trades you take to start receiving them.{" "}
            <a className="banner-link" href="#">
              Complete your profile
            </a>
          </div>
        </div>
        <button className="banner-close" aria-label="Dismiss">
          <svg className="ic">
            <use href="#i-x" />
          </svg>
        </button>
      </div>

      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker">Good Evening · Jul 22</div>
          <h1 className="page-title">Overview</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary">
            <svg className="ic">
              <use href="#i-bulb" />
            </svg>
            Smart Proposal
          </button>
          <button className="btn btn-ghost">
            <svg className="ic">
              <use href="#i-file" />
            </svg>
            Manual proposal
          </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-lbl">Revenue · 30D</div>
          <div className="kpi-val">$48,250</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Pipeline Value</div>
          <div className="kpi-val">$132,400</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Open Proposals</div>
          <div className="kpi-val accent">7</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">New Leads · 7D</div>
          <div className="kpi-val">12</div>
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
                <button className="dd-item active" type="button" role="option" data-range="7d">
                  Last 7 Days
                </button>
                <button className="dd-item" type="button" role="option" data-range="30d">
                  Last 30 Days
                </button>
                <button className="dd-item" type="button" role="option" data-range="90d">
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
              <div className="card-sub">
                Jul 19 – 25 · <b>11 scheduled</b>
              </div>
            </div>
          </div>
          <div className="week-strip">
            <div className="day" data-day="19"><div className="day-lbl">SU</div><div className="day-num">19</div><div className="day-dot off"></div></div>
            <div className="day" data-day="20"><div className="day-lbl">MO</div><div className="day-num">20</div><div className="day-dot"></div></div>
            <div className="day" data-day="21"><div className="day-lbl">TU</div><div className="day-num">21</div><div className="day-dot"></div></div>
            <div className="day today selected" data-day="22"><div className="day-lbl">WE</div><div className="day-num">22</div><div className="day-dot"></div></div>
            <div className="day" data-day="23"><div className="day-lbl">TH</div><div className="day-num">23</div><div className="day-dot"></div></div>
            <div className="day" data-day="24"><div className="day-lbl">FR</div><div className="day-num">24</div><div className="day-dot"></div></div>
            <div className="day" data-day="25"><div className="day-lbl">SA</div><div className="day-num">25</div><div className="day-dot"></div></div>
          </div>
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
        <a className="card-link" href="#">
          Open leads
          <svg className="ic">
            <use href="#i-arrow" />
          </svg>
        </a>
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
    </>
  );
}
