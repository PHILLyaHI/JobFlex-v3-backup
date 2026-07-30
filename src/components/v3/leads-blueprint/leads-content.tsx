"use client";

// Blueprint leads — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar and sprite come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (the filter chip rows, the table body, the board, the incoming grid
// and the staged list) are left empty exactly like the donor and filled by the
// ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One donor node moves: the delete-confirm dialog (`.mdl`) sits beside `.main`
// in the donor file, but this page may only render inside `.content`, so it is
// the last child here. It is `position: fixed`, so nothing about its painted
// geometry changes; leads-behavior.ts skips it in the reveal cascade and
// leads.module.css carries the matching stacking-context rule.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initLeadsContent } from "./leads-behavior";
import { STAGES } from "./leads-data";

export function LeadsContent() {
  useBlueprintContent(initLeadsContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Pipeline</div>
          <h1 className="page-title">Leads</h1>
        </div>
      </div>

      {/* TABS: All / Incoming — with Import as the row's right-hand action.
          Import is a verb, not a view, so it reads as a button rather than a
          third tab; it still switches to the import panel. */}
      <div className="ptabs" id="lTabs">
        <button className="ptab active" type="button" data-tab="all">
          All leads<span className="ptab-count" data-count="all">0</span>
        </button>
        <button className="ptab" type="button" data-tab="incoming">
          Incoming<span className="ptab-count" data-count="incoming">0</span>
        </button>
        <button className="ptab ptab--action" type="button" data-tab="import" id="goImport">
          <svg className="ic"><use href="#i-file" /></svg>
          Import leads
        </button>
      </div>

      {/* TAB: ALL */}
      <section className="ppanel" data-panel="all">
        <div className="lbar">
          <label className="lsearch">
            <svg className="ic">
              <use href="#i-search" />
            </svg>
            <input type="text" id="lSearch" placeholder="Search leads…" autoComplete="off" />
          </label>
          <div className="lbar-right">
            {/* The filter popover is a child of the button's wrapper, not a
                sibling of the bar, so it hangs off the control that opened it
                instead of pushing the table down the page. */}
            <div className="fwrap">
              <button
                className="btn btn-ghost btn--sm fbtn"
                type="button"
                id="filterBtn"
                aria-haspopup="dialog"
                aria-expanded="false"
                aria-controls="fPop"
              >
                <svg className="ic"><use href="#i-board" /></svg>Filters
                <span className="fcount is-hidden" id="fCount">0</span>
                <svg className="ic fchev"><use href="#i-chev" /></svg>
              </button>

              {/* Status / Source / Specialty. Status is an option list with a
                  live count per status; source and specialty stay chip rows —
                  short labels that read faster side by side than stacked. */}
              <div className="fpop" id="fPop" role="dialog" aria-label="Filters">
                <div className="fpop-head">
                  <span className="fpop-title">Filters</span>
                  <button className="fpop-clear" type="button" id="fClear">Clear all</button>
                </div>
                <div className="fgrp">
                  <div className="fgrp-lbl">Status</div>
                  <div className="dd fdd" id="fStatusDd">
                    <button className="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                      <span className="dd-label">All statuses</span>
                      <span className="dd-n" id="fStatusN">0</span>
                      <svg className="ic"><use href="#i-chev" /></svg>
                    </button>
                    <div className="dd-menu" role="listbox" aria-label="Status" id="fStatus"></div>
                  </div>
                </div>
                <div className="fgrp"><div className="fgrp-lbl">Source</div><div className="fgrp-row" id="fSource"></div></div>
                <div className="fgrp"><div className="fgrp-lbl">Specialty</div><div className="fgrp-row" id="fSpec"></div></div>
              </div>
            </div>
            <div className="vsw" id="vSwitch">
              <button className="vsw-btn active" type="button" data-view="table">Table</button>
              <button className="vsw-btn" type="button" data-view="board">Board</button>
            </div>
          </div>
        </div>

        <div id="tableView">
          <div className="card card--table" id="leadsCard">
            <table className="ptable">
              <thead>
                <tr><th>Lead</th><th>Project</th><th>Status</th><th>Assigned</th><th>Age</th><th className="th-open"></th></tr>
              </thead>
              <tbody id="leadTableBody"></tbody>
            </table>
          </div>
          <div className="pempty is-hidden" id="allEmpty">No leads match these filters</div>
          <div className="pager" id="leadsPager"></div>
        </div>

        {/* Board view — the dashboard's Lead Flow board, verbatim structure.
            The columns are static markup (exactly like dashboard-content.tsx)
            so their drag listeners survive every re-render; leads-behavior.ts
            only fills each `.stage-cards` and its `.stage-count`. Leads runs
            the full seven-stage pipeline, so this board carries two columns
            the dashboard's five-stage summary omits (Won, Lost). */}
        <div id="boardView" className="is-hidden">
          <div className="stage-board" id="lBoard">
            {STAGES.map((st) => (
              <div className="stage-col" data-stage={st.key} key={st.key}>
                <div className="stage-col-head">
                  <span className="stage-dot"></span>
                  <span className="stage-lbl">{st.label}</span>
                  <span className="stage-count">0</span>
                </div>
                <div className="stage-cards"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TAB: INCOMING */}
      <section className="ppanel is-hidden" data-panel="incoming">
        <div className="inbox-grid" id="inboxGrid"></div>
        <div className="pempty is-hidden" id="inboxEmpty">
          <b>{"You're all caught up"}</b><br />Leads routed to you — and fresh inquiries — show up here to accept or decline.
        </div>
      </section>

      {/* TAB: IMPORT */}
      <section className="ppanel is-hidden" data-panel="import">
        <div className="imeth" id="iMeth">
          <button className="imeth-btn active" type="button" data-m="manual"><svg className="ic"><use href="#i-pen" /></svg>Manual entry</button>
          <button className="imeth-btn" type="button" data-m="email"><svg className="ic"><use href="#i-msg" /></svg>Paste email</button>
          <button className="imeth-btn" type="button" data-m="file"><svg className="ic"><use href="#i-file" /></svg>File</button>
        </div>

        <div className="card imp-pane" data-m="manual">
          <label className="fld"><span className="fld-lbl">Name</span><input className="fld-in" id="mName" placeholder="J. Whitfield" /></label>
          <label className="fld"><span className="fld-lbl">Email</span><input className="fld-in" id="mEmail" placeholder="name@mail.com" /></label>
          <label className="fld"><span className="fld-lbl">Phone</span><input className="fld-in" id="mPhone" placeholder="(425) 555-0112" /></label>
          <label className="fld"><span className="fld-lbl">Project type</span><input className="fld-in" id="mProject" placeholder="Metal roof repair" /></label>
          <div className="fld-act"><button className="btn btn-ghost btn--sm" type="button" id="mAdd"><svg className="ic"><use href="#i-plus" /></svg>Add to import list</button></div>
        </div>

        <div className="card imp-pane is-hidden" data-m="email">
          <label className="fld"><span className="fld-lbl">Paste the email</span>
            <textarea className="fld-area" id="pasteBox" placeholder="Paste the full email here — we'll pull out the name, email and phone we can find." />
          </label>
          <div className="fld-act"><button className="btn btn-ghost btn--sm" type="button" id="pasteAdd"><svg className="ic"><use href="#i-plus" /></svg>Add to import list</button></div>
        </div>

        <div className="card imp-pane is-hidden" data-m="file">
          <button className="dropzone" type="button" id="dropZone">
            <svg className="ic">
              <use href="#i-file" />
            </svg>
            <span>Drop a CSV here or tap to choose</span>
          </button>
        </div>

        <div className="staged is-hidden" id="stagedWrap">
          <div className="staged-head">
            <span className="staged-title">Ready to import <b id="stagedCount">0</b></span>
            <button className="btn btn-primary btn--sm" type="button" id="importBtn"><svg className="ic"><use href="#i-check" /></svg>Import leads</button>
          </div>
          <div id="stagedList"></div>
        </div>
      </section>

      <div className="pmenu" id="pMenu"></div>

      <div className="mdl" id="mdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">Delete lead?</div>
          <div className="mdl-txt" id="mdlText">{"This can't be undone."}</div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">Cancel</button>
            <button className="btn btn-primary btn--sm" type="button" id="mdlOk"><svg className="ic"><use href="#i-trash" /></svg>Delete</button>
          </div>
        </div>
      </div>
    </>
  );
}
