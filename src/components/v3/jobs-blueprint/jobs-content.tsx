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
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initJobsContent } from "./jobs-behavior";
import { JobOffers } from "./job-offers";
import type { Job, JobClientOption, JobCrewOption, JobProposalOption } from "./jobs-data";

export type JobsContentProps = {
  /** The org's real board, read server-side. */
  entries: Job[];
  /** Clients the create dialog can attach the job to. */
  clients: JobClientOption[];
  /** Workers the create dialog can staff it with (empty for installers). */
  crew: JobCrewOption[];
  /** Proposals the create dialog can attach the job to. Optional link. */
  proposals: JobProposalOption[];
  /** Owner/manager. Gates the row menu's status writes — `updateJob` refuses
   *  for anyone else, so the items are not offered. */
  canManage: boolean;
  /** LIMITED role (installer/sales/estimator). Mounts the Offers popup in the
   *  page head and lets the rows headline the caller's own answer. */
  workerView?: boolean;
};

export function JobsContent({
  entries,
  clients,
  crew,
  proposals,
  canManage,
  workerView = false,
}: JobsContentProps) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. Written once, on
  // first render; from then on the behavior module owns the board and keeps
  // itself in step with the database through the server actions.
  const seedRef = useRef({ entries, clients, crew, proposals, canManage, workerView });

  // Same contract as the seed, and for the same reason. The row's three doors
  // (whole row, arrow, "Open job") all go through this: the job record is a
  // blueprint page whose entrance cascade is armed from a layout effect, and a
  // hard document load paints the finished page, then drops it to opacity 0 and
  // replays the entrance — the "shows one version, then the real one" double
  // take. See `navigate` in jobs-behavior.ts.
  const router = useRouter();
  const routerRef = useRef(router);

  const init = useCallback(
    (content: HTMLElement) =>
      initJobsContent(content, {
        ...seedRef.current,
        navigate: (href) => routerRef.current.push(href as Route),
      }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Delivery</div>
          <h1 className="page-title">Jobs</h1>
        </div>
        <div className="page-actions">
          {/* Crew roles only: pending offers with Accept / Decline, polling —
              a React island in the ported page head. The popup anchors to its
              own wrapper, so the FLUID SCALE zoom never enters the maths. */}
          {workerView ? <JobOffers /> : null}
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
                {/* One actions column, not two — see `.j-acts` in jobs.module.css. */}
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

            {/* Real clients, read server-side — a COMBOBOX, not a select.
                `createJob` links by id, so a picked row carries the id; but the
                field also has to accept a name that is not in the book yet
                (the job comes first, the client record catches up), and a
                <select> cannot express that. Free text is created through the
                existing `createClient` action on submit and the new id is what
                `createJob` receives — see jobs-behavior. The list itself is the
                published `.bp-sug` popup (blueprint-global.css), appended to
                <body> by ./combo. */}
            <div className="fld" data-fld="client">
              <label className="fld-lbl" htmlFor="jfClient">Client</label>
              <div className="jcombo">
                <input
                  className="pinput jcombo-in"
                  id="jfClient"
                  name="client"
                  type="text"
                  placeholder="Search clients, or type a new name"
                  autoComplete="off"
                />
                <button
                  className="jcombo-caret"
                  type="button"
                  id="jfClientCaret"
                  aria-label="Show clients"
                  tabIndex={-1}
                ></button>
              </div>
              <span className="fld-hint" id="jfClientHint">
                Leave empty for no client. A name we don&apos;t have is added to your book.
              </span>
            </div>

            {/* OPTIONAL proposal link (`Job.proposalId`) — the same relation the
                projects board's attach-job flow writes. Strict: free text here
                means "no proposal", because a proposalId can only point at a
                row that exists. */}
            <div className="fld" data-fld="proposal">
              <label className="fld-lbl" htmlFor="jfProposal">
                Attach proposal <span className="fld-opt">optional</span>
              </label>
              <div className="jcombo">
                <input
                  className="pinput jcombo-in"
                  id="jfProposal"
                  name="proposal"
                  type="text"
                  placeholder="Search proposals — leave empty for none"
                  autoComplete="off"
                />
                <button
                  className="jcombo-caret"
                  type="button"
                  id="jfProposalCaret"
                  aria-label="Show proposals"
                  tabIndex={-1}
                ></button>
              </div>
              <span className="fld-hint">Links the job to the paperwork it came from.</span>
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

      {/* SCHEDULE DIALOG — the row menu's "Schedule" / "Reschedule". Same frame
          as the create dialog, two date fields, nothing else: the day is the
          decision, the clock is the job record's business. */}
      <div className="mdl" id="jSched" role="dialog" aria-modal="true" aria-labelledby="jSchedTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box mdl-box--slim">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Delivery / schedule</span>
              <div className="mdl-title" id="jSchedTitle">Schedule job</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <form className="mdl-body" id="jSchedForm" noValidate>
            <p className="mdl-lede" id="jSchedWho"></p>
            <div className="mdl-row">
              <div className="fld" data-fld="schedStart">
                <label className="fld-lbl" htmlFor="jsStart">
                  Starts<span className="req">*</span>
                </label>
                <input className="pinput" id="jsStart" name="start" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
                <span className="fld-err">Pick the day it starts</span>
              </div>
              <div className="fld">
                <label className="fld-lbl" htmlFor="jsEnd">Ends</label>
                <input className="pinput" id="jsEnd" name="end" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
              </div>
            </div>
            <span className="fld-hint" id="jSchedHint"></span>
          </form>
          <div className="mf-err mf-err--boxed is-hidden" id="jSchedErr" role="alert"></div>
          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">Cancel</button>
            <button className="btn btn-primary" type="submit" form="jSchedForm" id="jSchedOk">
              <svg className="ic">
                <use href="#i-cal" />
              </svg>
              <span data-save-lbl>Save schedule</span>
            </button>
          </div>
        </div>
      </div>

      {/* CREW DIALOG — the row menu's "Assign crew". The roster as toggles,
          seeded from the job's live assignments; the diff on save is what the
          two existing assignment actions are called with. */}
      <div className="mdl" id="jCrew" role="dialog" aria-modal="true" aria-labelledby="jCrewTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box mdl-box--slim">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Delivery / dispatch</span>
              <div className="mdl-title" id="jCrewTitle">Assign crew</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <form className="mdl-body" id="jCrewForm" noValidate>
            <p className="mdl-lede" id="jCrewWho"></p>
            <div className="fld">
              <span className="fld-lbl">Roster</span>
              <div className="fseg" id="jCrewList" role="group" aria-label="Assign crew"></div>
              <span className="fld-hint">
                Newly invited crew start as pending until they accept in the worker portal.
              </span>
            </div>
          </form>
          <div className="mf-err mf-err--boxed is-hidden" id="jCrewErr" role="alert"></div>
          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">Cancel</button>
            <button className="btn btn-primary" type="submit" form="jCrewForm" id="jCrewOk">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              <span data-save-lbl>Save crew</span>
            </button>
          </div>
        </div>
      </div>

      {/* DELETE CONFIRM — the only irreversible item on the row menu, so it
          gets a stop rather than an optimistic row exit. */}
      <div className="mdl" id="jDel" role="dialog" aria-modal="true" aria-labelledby="jDelTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box mdl-box--slim">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Delivery / delete</span>
              <div className="mdl-title" id="jDelTitle">Delete job</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <div className="mdl-body">
            <p className="mdl-lede" id="jDelWho"></p>
            <p className="mdl-lede mdl-lede--warn">
              This removes the record, its crew invitations, photos, expenses and change orders.
              Cancelling the job instead keeps all of it.
            </p>
          </div>
          <div className="mf-err mf-err--boxed is-hidden" id="jDelErr" role="alert"></div>
          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">Keep it</button>
            <button className="btn btn-danger" type="button" id="jDelOk">
              <svg className="ic">
                <use href="#i-trash" />
              </svg>
              <span data-save-lbl>Delete job</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
