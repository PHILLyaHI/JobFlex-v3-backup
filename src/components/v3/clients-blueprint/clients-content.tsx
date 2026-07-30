"use client";

// Blueprint clients — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-clients-blueprint_2.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#cMast, #cChips, the table body, the
// pager and #pMenu) are left empty exactly like the donor and filled by the
// ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initClientsContent } from "./clients-behavior";

export function ClientsContent() {
  useBlueprintContent(initClientsContent);

  return (
    <>
      {/* PAGE HEAD — eyebrow "CRM", title and copy from the original page */}
      <div className="page-head">
        <div>
          <div className="kicker">CRM</div>
          <h1 className="page-title">Clients</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="newClientBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New client
          </button>
        </div>
      </div>

      {/* MASTHEAD — computed from the same fields: pipeline, proposals, clients */}
      <div className="pmast" id="cMast"></div>

      {/* TAG FILTER — real client labels only */}
      <div className="pchips" id="cChips"></div>

      {/* CLIENTS TABLE — the original page's columns */}
      <div className="card card--table" id="clientsCard">
        <table className="ptable">
          <thead>
            <tr>
              <th>Client</th>
              <th>Location</th>
              <th>Tags</th>
              <th className="num">Proposals</th>
              <th className="num">Pipeline</th>
              <th>Updated</th>
              <th className="th-open"></th>
            </tr>
          </thead>
          <tbody id="clientTableBody"></tbody>
        </table>
      </div>
      <div className="pempty is-hidden" id="clientsEmpty">
        <b>No clients yet</b>
        <br />Send your first proposal and a client is created automatically.
      </div>
      <div className="pager" id="clientsPager"></div>
      <div className="pmenu" id="pMenu"></div>

      {/* CREATE DIALOG — opened by #newClientBtn, wired in clients-behavior.
          Static markup (not injected) so it is server-rendered like the rest of
          the page and the ported script only toggles `.open`. The submit button
          sits in the beige foot, OUTSIDE the scrolling body, and reaches the
          form through `form="cNewForm"`. */}
      <div className="mdl" id="cNew" role="dialog" aria-modal="true" aria-labelledby="cNewTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick">CRM / new record</span>
              <div className="mdl-title" id="cNewTitle">New client</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>

          <form className="mdl-body" id="cNewForm" noValidate>
            <div className="fld" data-fld="name">
              <label className="fld-lbl" htmlFor="cfName">
                Client name<span className="req">*</span>
              </label>
              <input
                className="pinput"
                id="cfName"
                name="name"
                type="text"
                placeholder="D. Reyes"
                autoComplete="off"
              />
              <span className="fld-err">Enter a client name</span>
            </div>

            <div className="mdl-row">
              <div className="fld">
                <label className="fld-lbl" htmlFor="cfEmail">Email</label>
                <input
                  className="pinput"
                  id="cfEmail"
                  name="email"
                  type="email"
                  placeholder="d.reyes@mail.com"
                  autoComplete="off"
                />
              </div>
              <div className="fld">
                <label className="fld-lbl" htmlFor="cfAddress">Location</label>
                <input
                  className="pinput"
                  id="cfAddress"
                  name="address"
                  type="text"
                  placeholder="Kirkland, WA"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="fld">
              <label className="fld-lbl" htmlFor="cfTags">Tags</label>
              <input
                className="pinput"
                id="cfTags"
                name="tags"
                type="text"
                placeholder="Fencing, Repeat"
                autoComplete="off"
              />
              <span className="fld-hint">Comma-separated — they become the page&apos;s filter chips.</span>
            </div>

            <div className="fld">
              <span className="fld-lbl">Account</span>
              <button className="fchk" type="button" id="cfVip" aria-pressed="false">
                <span className="fchk-box">
                  <svg className="ic">
                    <use href="#i-check" />
                  </svg>
                </span>
                Mark as VIP
                <span className="fchk-sub">priority scheduling</span>
              </button>
            </div>
          </form>

          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="cNewForm">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              Create client
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
