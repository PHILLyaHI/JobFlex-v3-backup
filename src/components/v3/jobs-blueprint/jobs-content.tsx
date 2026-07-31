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

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initJobsContent } from "./jobs-behavior";
import type { Job, JobClientOption, JobCrewOption } from "./jobs-data";

export type JobsContentProps = {
  /** The org's real board, read server-side. */
  entries: Job[];
  /** Clients the create dialog can attach the job to. */
  clients: JobClientOption[];
  /** Workers the create dialog can staff it with (empty for installers). */
  crew: JobCrewOption[];
  /** Owner/manager. Gates the row menu's status writes — `updateJob` refuses
   *  for anyone else, so the items are not offered. */
  canManage: boolean;
};

export function JobsContent({ entries, clients, crew, canManage }: JobsContentProps) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. Written once, on
  // first render; from then on the behavior module owns the board and keeps
  // itself in step with the database through the server actions.
  const seedRef = useRef({ entries, clients, crew, canManage });

  const init = useCallback((content: HTMLElement) => initJobsContent(content, seedRef.current), []);
  useBlueprintContent(init);

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

            {/* Real clients, read server-side. The value carried is the client
                id — `createJob` links by id, not by name — so this is a select
                and not the free-text field the fixture era used. */}
            <div className="fld">
              <label className="fld-lbl" htmlFor="jfClient">Client</label>
              <span className="bp-sel">
                <select className="bp-sel-in" id="jfClient" name="clientId" defaultValue="">
                  <option value="">— No client —</option>
                </select>
              </span>
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

            {/* Schedule. `type="text"`, not `type="date"`: the native control
                opens an OS panel no stylesheet can reach, so both fields are
                upgraded on mount by components/v3/shared/date-popover.ts —
                which wraps them, adds the Start/End identity icons and hangs
                the blueprint month grid off each. The value they carry is
                still the same "YYYY-MM-DD" string the native input produced,
                which is what parseDay / longDate / relLabel parse. */}
            <div className="mdl-row">
              <div className="fld">
                <label className="fld-lbl" htmlFor="jfStart">Starts</label>
                <input className="pinput" id="jfStart" name="start" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
              </div>
              <div className="fld">
                <label className="fld-lbl" htmlFor="jfEnd">Ends</label>
                <input className="pinput" id="jfEnd" name="end" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
              </div>
            </div>

            {/* Crew toggles, filled on mount from the org's real roster. The
                whole field is hidden for installers, who are auto-assigned to
                their own jobs server-side and can't staff anyone else. */}
            <div className="fld" id="jfCrewFld">
              <span className="fld-lbl">Crew</span>
              <div className="fseg" id="jfCrew" role="group" aria-label="Assign crew"></div>
              <span className="fld-hint">Tap to assign — leave empty to dispatch later.</span>
            </div>
          </form>

          {/* createJob refuses with a message written for the user (plan limit
              reached, worker profile missing). It lands here rather than the
              dialog closing on a write that never happened. */}
          <div className="mf-err mf-err--boxed is-hidden" id="jNewErr" role="alert"></div>

          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="jNewForm" id="jNewOk">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              <span data-save-lbl>Create job</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
