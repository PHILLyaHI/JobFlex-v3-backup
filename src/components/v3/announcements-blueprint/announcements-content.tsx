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

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initAnnouncementsContent } from "./announcements-behavior";

export function AnnouncementsContent() {
  useBlueprintContent(initAnnouncementsContent);

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
          (see the file header). The ported script only toggles `.open`. */}
      <div className="mdl" id="annMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div className="mdl-title">New announcement</div>
            <div className="mdl-sub">Shows as a banner above every dashboard page. Choose priority carefully.</div>
          </div>
          <div className="mdl-body">
            <label className="af"><span className="af-lbl">Title</span>
              <input className="af-in" id="annTitle" placeholder="Shop closed Friday" /></label>
            <label className="af"><span className="af-lbl">Body</span>
              <textarea className="af-area" id="annBody" placeholder="One or two lines — it sits beside the title in the banner."></textarea></label>
            <div className="af af-row">
              <label><span className="af-lbl">Priority</span>
                <select className="af-in" id="annPriority" defaultValue="0">
                  <option value="0">Normal</option>
                  <option value="1">Warn</option>
                  <option value="2">High</option>
                </select></label>
              <label><span className="af-lbl">Expires (optional)</span>
                <input className="af-in" id="annExpires" type="date" /></label>
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
              Publish
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
