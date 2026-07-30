"use client";

// Blueprint calendar — page CONTENT only. The donor's `.content` children
// (jobflex-calendar-blueprint_5.html), verbatim; the sidebar, topbar, sprite
// and graph-paper field come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (#mgHead/#mgGrid, #wgHead/#wgBody, #tgHead/#tgBody, the filter sets,
// #trayList and #sheetBody) are left empty exactly like the donor and filled
// by the ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// Two donor nodes are NOT `.content` children in the donor file: `#sheetBg`
// and `#sheet` are siblings of `.main`, both `position: fixed`. The page can
// only render inside `.content`, so they ship here at the end of the fragment
// and the behavior module excludes them from the reveal cascade to keep it
// donor-exact. See the manifest note about their stacking context.
//
// The donor sprite is byte-identical to the shell's 42-symbol sprite, so no
// page-local sprite is needed.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initCalendarContent } from "./calendar-behavior";
import "./calendar-global.css";

export function CalendarContent() {
  useBlueprintContent(initCalendarContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Delivery</div>
          <h1 className="page-title">Calendar</h1>
        </div>
      </div>

      {/* TOOLBAR: navigation · title · views · inbox · create · tray */}
      <div className="cal-bar">
        <div className="cal-bar-l">
          <button className="cal-nav" type="button" id="calPrev" aria-label="Previous">
            <svg className="ic rot-l">
              <use href="#i-chev" />
            </svg>
          </button>
          <button className="cal-nav" type="button" id="calNext" aria-label="Next">
            <svg className="ic rot-r">
              <use href="#i-chev" />
            </svg>
          </button>
          <button className="btn btn-ghost btn--sm" type="button" id="calToday">
            Today
          </button>
          <div className="cal-title" id="calTitle">—</div>
        </div>
        <div className="cal-bar-r">
          <div className="vsw" id="calViews">
            <button className="vsw-btn active" type="button" data-view="month">Month</button>
            <button className="vsw-btn" type="button" data-view="week">Week</button>
            <button className="vsw-btn" type="button" data-view="team">Team</button>
          </div>
          <button className="cal-nav has-badge" type="button" id="inboxBtn" aria-label="Crew inbox">
            <svg className="ic">
              <use href="#i-bell" />
            </svg>
            <span className="cal-badge" id="inboxN">0</span>
          </button>
          <button className="btn btn-primary btn--sm" type="button" id="newEventBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New event
          </button>
          <button className="cal-nav has-badge active" type="button" id="trayBtn" aria-label="Toggle unscheduled tray">
            <svg className="ic">
              <use href="#i-board" />
            </svg>
            <span className="cal-badge" id="trayN">0</span>
          </button>
        </div>
      </div>

      {/* FILTERS: search · worker dropdown · status dropdown */}
      <div className="cal-filters">
        <label className="lsearch">
          <svg className="ic">
            <use href="#i-search" />
          </svg>
          <input type="text" id="calSearch" placeholder="Search events…" autoComplete="off" />
        </label>
        <div className="fdd" id="workerFilter"></div>
        {/* Statuses are four fixed values, so they are direct toggles — a
            dropdown would hide them behind a click for no gain. */}
        <div className="fset" id="statusFilter"></div>
        <button className="cal-clear is-hidden" type="button" id="calClear">
          Clear <span id="clearN">0</span>
        </button>
      </div>

      {/* CALENDAR + TRAY */}
      <div className="cal-wrap" id="calWrap">
        <div className="cal-main">
          <div className="card cal-card" id="monthCard">
            <div className="mg-head" id="mgHead"></div>
            <div className="mg-grid" id="mgGrid"></div>
          </div>

          {/* The head lives INSIDE the scroller and sticks: sharing one
              scroll container is what keeps its 8 columns on the same grid as
              the body's. Outside it, the body's vertical scrollbar narrowed
              only the body and every column drifted left of its header. */}
          {/* `#wgHead` IS the grid, not a block wrapping one. It used to be a
              plain block holding a `.wg-head` grid and (when the week had any)
              a separate `.wg-allday` grid — three elements that each had to
              arrive at the same eight columns on their own, one of which sized
              itself against the scroll container rather than the body. Now the
              day names and the all-day band are rows of ONE grid that is a
              sibling of `.wg-body`, so "the head drifted off the body's
              columns" has no mechanism left. */}
          <div className="card cal-card is-hidden" id="weekCard">
            <div className="wg-scroll" id="wgScroll">
              <div className="wg-head" id="wgHead"></div>
              <div className="wg-body" id="wgBody"></div>
            </div>
          </div>

          <div className="card cal-card is-hidden" id="teamCard">
            <div className="tg-head" id="tgHead"></div>
            <div className="tg-body" id="tgBody"></div>
          </div>
        </div>

        <aside className="tray" id="tray">
          <div className="tray-head">
            <div>
              <div className="kpi-lbl">Unscheduled</div>
              <div className="tray-sub">Drag a job onto a day to schedule it</div>
            </div>
            <span className="tray-count" id="trayCount">0</span>
          </div>
          <div className="tray-list" id="trayList"></div>
          <div className="tray-empty is-hidden" id="trayEmpty">Everything is scheduled</div>
        </aside>
      </div>
      <div className="pmenu" id="pMenu"></div>

      {/* Donor siblings of `.main` — both position: fixed. */}
      <div className="sheet-bg" id="sheetBg"></div>
      <aside className="sheet" id="sheet">
        <div className="sheet-head">
          <div className="sheet-title" id="sheetTitle">—</div>
          <button className="sheet-x" type="button" data-sheet="close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body" id="sheetBody"></div>
      </aside>
    </>
  );
}
