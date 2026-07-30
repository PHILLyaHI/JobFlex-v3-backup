"use client";

// Blueprint jobs — page CONTENT only. The donor's `.content` children
// (jobflex-jobs-blueprint.html), verbatim; the sidebar, topbar, sprite,
// graph-paper field and the `.content` container itself come from the shared
// shell (components/v3/blueprint-shell), which persists across navigation.
//
// The dynamic regions (#jTabs, #jobsBody, #jobsCards, #jobsPager, #pMenu) are
// left empty exactly like the donor and filled by the ported script on mount —
// same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// The donor's 42-symbol sprite is byte-identical to the shell's, so no local
// sprite is rendered — every <use href="#i-…"> here resolves against it.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initJobsContent } from "./jobs-behavior";

export function JobsContent() {
  useBlueprintContent(initJobsContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Delivery</div>
          <h1 className="page-title">Jobs</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="newJobBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New job
          </button>
        </div>
      </div>

      {/* status tabs: All / Scheduled / In progress / Completed / Canceled */}
      <div className="jtabs" id="jTabs"></div>

      {/* desktop: table */}
      <div className="jdesk">
        <div className="card card--table" id="jobsCard">
          <table className="ptable jtable">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Schedule</th>
                <th className="num">Crew</th>
                <th className="th-open"></th>
              </tr>
            </thead>
            <tbody id="jobsBody"></tbody>
          </table>
        </div>
      </div>

      {/* mobile: cards */}
      <ul className="jmob" id="jobsCards"></ul>

      <div className="pempty is-hidden" id="jobsEmpty">
        <b>No jobs match this filter</b><br />Accept a proposal in the client portal — a job appears here automatically.
      </div>
      <div className="pager" id="jobsPager"></div>
      <div className="pmenu" id="pMenu"></div>

      {/* CREATE DIALOG — opened by #newJobBtn, wired in jobs-behavior. Static
          markup (not injected) so it is server-rendered like the rest of the
          page and the ported script only toggles `.open`. The submit button sits
          in the beige foot, OUTSIDE the scrolling body, and reaches the form
          through `form="jNewForm"`. */}
      <div className="mdl" id="jNew" role="dialog" aria-modal="true" aria-labelledby="jNewTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Delivery / new record</span>
              <div className="mdl-title" id="jNewTitle">New job</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>

          <form className="mdl-body" id="jNewForm" noValidate>
            <div className="fld" data-fld="title">
              <label className="fld-lbl" htmlFor="jfTitle">
                Job<span className="req">*</span>
              </label>
              <input
                className="pinput"
                id="jfTitle"
                name="title"
                type="text"
                placeholder="Cedar fence — 902 Alder Ct"
                autoComplete="off"
              />
              <span className="fld-err">Enter what the job is</span>
            </div>

            <div className="fld">
              <label className="fld-lbl" htmlFor="jfClient">Client</label>
              <input
                className="pinput"
                id="jfClient"
                name="client"
                type="text"
                placeholder="D. Reyes"
                autoComplete="off"
                list="jfClientList"
              />
              {/* the clients already on the page, offered as suggestions —
                  filled on mount from the same fixture the table renders */}
              <datalist id="jfClientList"></datalist>
            </div>

            <div className="fld">
              <span className="fld-lbl">Status</span>
              <div className="fseg" id="jfStatus" role="group" aria-label="Job status">
                <button className="fseg-btn on" type="button" data-v="SCHEDULED" aria-pressed="true">
                  <span className="fseg-dot"></span>Scheduled
                </button>
                <button className="fseg-btn" type="button" data-v="IN_PROGRESS" aria-pressed="false">
                  <span className="fseg-dot"></span>In progress
                </button>
                <button className="fseg-btn" type="button" data-v="COMPLETED" aria-pressed="false">
                  <span className="fseg-dot"></span>Completed
                </button>
                <button className="fseg-btn" type="button" data-v="CANCELED" aria-pressed="false">
                  <span className="fseg-dot"></span>Canceled
                </button>
              </div>
            </div>

            <div className="mdl-row">
              <div className="fld">
                <label className="fld-lbl" htmlFor="jfStart">Starts</label>
                <input className="pinput" id="jfStart" name="start" type="date" />
              </div>
              <div className="fld">
                <label className="fld-lbl" htmlFor="jfEnd">Ends</label>
                <input className="pinput" id="jfEnd" name="end" type="date" />
              </div>
            </div>

            <div className="fld">
              <label className="fld-lbl" htmlFor="jfCrew">Crew</label>
              <input
                className="pinput"
                id="jfCrew"
                name="crew"
                type="text"
                placeholder="Marcus B., Dan K."
                autoComplete="off"
              />
              <span className="fld-hint">Comma-separated — leave empty to dispatch later.</span>
            </div>
          </form>

          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="jNewForm">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              Create job
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
