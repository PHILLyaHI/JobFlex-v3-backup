"use client";

// Blueprint projects — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar and sprite come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. The
// dynamic regions (#pjChips and #pjGrid) are left empty exactly like the donor
// and filled by the ported script on mount — same architecture, same timing.
// The donor's third empty region, `#pMenu`, is dropped: nothing in the port
// ever filled it and no rule ever styled it, so it was a permanently empty
// node sitting in the reveal cascade.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initProjectsContent } from "./projects-behavior";
import type { Project } from "./projects-data";

/**
 * @param projects the org's real project book, read in the page's server
 *   component. The behavior module takes it as its starting state and then
 *   keeps itself in step with the database through `createProject`.
 */
export function ProjectsContent({ projects }: { projects: Project[] }) {
  // The rows reach `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a
  // re-run tears the page down and replays the whole reveal cascade — so the
  // init has to stay referentially stable for the life of the mount. The ref is
  // never written after creation: it is seeded on the first render, the layout
  // effect that reads it runs against that same commit, and from then on the
  // behavior module owns the book. A navigation away unmounts the component, so
  // the next visit gets a fresh ref holding freshly-queried rows.
  const seedRef = useRef(projects);

  const init = useCallback(
    (content: HTMLElement) => initProjectsContent(content, { projects: seedRef.current }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker">Delivery</div>
          <h1 className="page-title">Projects</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="newProjectBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New project
          </button>
        </div>
      </div>

      {/* Project status filter (ACTIVE | ON_HOLD | COMPLETED) */}
      <div className="pchips" id="pjChips"></div>

      <div className="pj-grid" id="pjGrid"></div>

      <div className="pempty is-hidden" id="pjEmpty">
        <b>No projects yet</b>
        <br />
        Bundle related jobs together to track multi-phase builds and shared budgets.
      </div>

      {/* CREATE DIALOG — opened by #newProjectBtn, wired in projects-behavior.
          Static markup (not injected) so it is server-rendered like the rest of
          the page and the ported script only toggles `.open`. The submit button
          sits in the beige foot, OUTSIDE the scrolling body, and reaches the
          form through `form="pjNewForm"`. */}
      <div className="mdl" id="pjNew" role="dialog" aria-modal="true" aria-labelledby="pjNewTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">Delivery / new record</span>
              <div className="mdl-title" id="pjNewTitle">New project</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>

          <form className="mdl-body" id="pjNewForm" noValidate>
            {/* Server-action failures land here — the plan-limit refusal and the
                permission refusal both carry text written for the user. */}
            <div className="mdl-err is-hidden" id="pjNewErr" role="alert"></div>

            <div className="fld" data-fld="name">
              <label className="fld-lbl" htmlFor="pjfName">
                Project name<span className="req">*</span>
              </label>
              <input
                className="pinput"
                id="pjfName"
                name="name"
                type="text"
                placeholder="Willow Park fencing"
                autoComplete="off"
              />
              <span className="fld-err">Enter a project name</span>
            </div>

            <div className="fld">
              <label className="fld-lbl" htmlFor="pjfDesc">Scope</label>
              <textarea
                className="pinput"
                id="pjfDesc"
                name="description"
                placeholder="Cedar privacy fencing for eight lots, shared materials drop."
              ></textarea>
            </div>

            <div className="fld">
              <span className="fld-lbl">Status</span>
              <div className="fseg" id="pjfStatus" role="group" aria-label="Project status">
                <button className="fseg-btn on" type="button" data-v="ACTIVE" aria-pressed="true">
                  <span className="fseg-dot"></span>active
                </button>
                <button className="fseg-btn" type="button" data-v="ON_HOLD" aria-pressed="false">
                  <span className="fseg-dot"></span>on hold
                </button>
                <button className="fseg-btn" type="button" data-v="COMPLETED" aria-pressed="false">
                  <span className="fseg-dot"></span>completed
                </button>
              </div>
            </div>

            {/* Schedule. `type="text"`, not `type="date"`: the native control
                opens an OS panel no stylesheet can reach, and both fields drew
                the same grey browser glyph, so Starts and Ends looked
                identical. components/v3/shared/date-popover.ts upgrades them on
                mount — a clock on Starts, an hourglass on Ends (the calendar
                page's own pairing) and the blueprint month grid on each. The
                value stays the "YYYY-MM-DD" string shortDate parses. */}
            <div className="mdl-row">
              <div className="fld">
                <label className="fld-lbl" htmlFor="pjfStart">Starts</label>
                <input className="pinput" id="pjfStart" name="startsAt" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
              </div>
              <div className="fld">
                <label className="fld-lbl" htmlFor="pjfEnd">Ends</label>
                <input className="pinput" id="pjfEnd" name="endsAt" type="text" placeholder="YYYY-MM-DD" autoComplete="off" />
              </div>
            </div>

            <div className="fld">
              <label className="fld-lbl" htmlFor="pjfBudget">Budget</label>
              <input
                className="pinput"
                id="pjfBudget"
                name="budget"
                type="text"
                inputMode="numeric"
                placeholder="74,300"
                autoComplete="off"
              />
            </div>
          </form>

          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="pjNewForm" id="pjNewOk">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              <span data-save-lbl>Create project</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
