"use client";

// Blueprint announcements — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-announcements-blueprint_1.html); the sidebar, topbar and
// sprite come from the shared shell (components/v3/blueprint-shell), which
// persists across navigation. Dynamic regions (#activeList, #activeEmpty,
// #archiveCard / #archiveSub / #archiveList and #annPreview) are left empty
// exactly like the donor and filled by the ported script on mount — same
// architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural move: the donor mounts `#annMdl` beside `.main`, as a direct
// child of `.layout` — chrome this port does not own. It ships here as the last
// child of `.content` instead (the same place every sibling page keeps its
// dialog), and announcements.module.css drops `.content`'s `z-index: 1` while a
// dialog is open so the fixed overlay still resolves above the sticky topbar,
// exactly as it did beside `.main`.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initAnnouncementsContent } from "./announcements-behavior";
import type { Announcement } from "./announcements-data";

/**
 * @param entries the org's real announcements, read in the page's server
 *   component. The behavior module takes them as its starting state and then
 *   keeps itself in step with the database through the announcement server
 *   actions (publish → createAnnouncement, retire → dismissAnnouncement).
 */
export function AnnouncementsContent({ entries }: { entries?: Announcement[] } = {}) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. Written once, on the
  // first render; from then on the behavior module owns the board.
  const seedRef = useRef(entries);

  const init = useCallback(
    (content: HTMLElement) => initAnnouncementsContent(content, { entries: seedRef.current }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Communication</div>
          <h1 className="page-title">Announcements</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="newAnnBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New announcement
          </button>
        </div>
      </div>

      {/* ACTIVE */}
      <div className="card an-card">
        <div className="an-head">
          <div>
            <div className="card-title">Active</div>
            <div className="card-sub">Visible on every dashboard page right now.</div>
          </div>
          <span className="pstatus an-count" id="activeCount">0</span>
        </div>
        <div className="an-body">
          {/* Retire failures land here — the × calls a real server action, and a
              refusal has to say so instead of leaving the banner sitting there
              looking like a dead control. */}
          <p className="mf-err is-hidden" id="annListErr" role="alert"></p>
          <div className="banners" id="activeList"></div>
          <p className="an-none is-hidden" id="activeEmpty">No active announcements.</p>
        </div>
      </div>

      {/* ARCHIVE */}
      <div className="card an-card an-archive is-hidden" id="archiveCard">
        <div className="an-head">
          <div>
            <div className="card-title">Archive</div>
            <div className="card-sub" id="archiveSub">—</div>
          </div>
        </div>
        <ul className="arch" id="archiveList"></ul>
      </div>
      <div className="pmenu" id="pMenu"></div>

      {/* NEW-ANNOUNCEMENT DIALOG — donor markup, relocated inside `.content`
          (see the file header). announcements-behavior opens and closes it
          through the shell's `openMdl` / `closeMdl`, so it animates both ways;
          every dismiss affordance here is a `data-mdl="close"` hook into that
          one delegated handler. */}
      <div className="mdl" id="annMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <div className="mdl-title">New announcement</div>
            </div>
            {/* Corner dismiss. `data-mdl="close"` is the same hook the backdrop
                and Cancel already use, so the delegated handler in
                announcements-behavior routes it through `closeMdl` and the
                dialog plays its exit instead of cutting. */}
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <div className="mdl-body">
            {/* createAnnouncement is manager-gated and validated server-side; its
                rejection message is written for the user, so it is shown verbatim
                here rather than swallowed. */}
            <div className="mf-err is-hidden" id="annErr" role="alert"></div>
            <label className="af"><span className="af-lbl">Title</span>
              <input className="af-in" id="annTitle" placeholder="Shop closed Friday" /></label>
            <label className="af"><span className="af-lbl">Body</span>
              <textarea className="af-area" id="annBody" placeholder="One or two lines — it sits beside the title in the banner."></textarea></label>
            <div className="af af-row">
              <label><span className="af-lbl">Priority</span>
                {/* The shared blueprint select: `.bp-sel` is the wrapper that
                    draws the chevron (a <select> can carry no pseudo-element),
                    `.bp-sel-in` the appearance reset — both published once in
                    dashboard-blueprint/blueprint-global.css. `.af-in` is not
                    kept on the control: at `.bp .content .af-in` (3 classes)
                    it out-specifies `.jf-blueprint .bp-sel-in` (2) and would
                    pull the native box back. The wrapper is inside the
                    <label>, so the `.af-row` grid still lays out two labels.
                    Geometry to match the Expires field beside it lives in
                    announcements.module.css. */}
                <span className="bp-sel">
                  <select className="bp-sel-in" id="annPriority" defaultValue="0">
                    <option value="0">Normal</option>
                    <option value="1">Warn</option>
                    <option value="2">High</option>
                  </select>
                </span></label>
              {/* `type="text"`, not `type="date"`: the native control opens an
                  OS panel no stylesheet can reach. components/v3/shared/
                  date-popover.ts upgrades it on mount — the hourglass the
                  calendar page uses for an end, plus the blueprint month grid
                  — and the value stays the "YYYY-MM-DD" string the preview and
                  the published record already carry.

                  The cell is a plain <div> with an explicit `htmlFor` label,
                  not a wrapping <label> like Priority beside it: the picker
                  adds a disclosure BUTTON next to the input, and a <label> may
                  not contain interactive content other than the control it
                  names. The `.af-row` grid and `.af-lbl` type are unchanged —
                  both are element-agnostic. */}
              <div><label className="af-lbl" htmlFor="annExpires">Expires (optional)</label>
                <input className="af-in" id="annExpires" type="text" placeholder="YYYY-MM-DD" autoComplete="off" /></div>
            </div>
            <div className="af">
              <span className="af-lbl">Preview</span>
              <div className="banners" id="annPreview"></div>
            </div>
          </div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">Cancel</button>
            <button className="btn btn-primary btn--sm" type="button" id="publishBtn">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              {/* Wrapped so the behavior module can swap the label to "Publishing…"
                  while createAnnouncement is in flight without touching the icon. */}
              <span data-save-lbl>Publish</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
