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

import { useCallback, useRef } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initClientsContent } from "./clients-behavior";
import type { Client } from "./clients-data";

/**
 * @param entries the org's real client book, read in the page's server
 *   component. The behavior module takes it as its starting state and then
 *   keeps itself in step with the database through the client server actions.
 */
export function ClientsContent({ entries }: { entries?: Client[] }) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. Same contract as
  // workers-content.tsx.
  const seedRef = useRef(entries);
  // Same contract as the seed, and for the same reason: it reaches `init`
  // through a ref rather than through the dependency array. `useRouter` returns
  // the same object for the life of the mount, so seeding the ref once is
  // enough — and writing to a ref during render is not allowed. Identical to
  // advanced-ai-content.tsx. The behavior module opens the client record with
  // it — see `navigate` in clients-behavior.ts for why a client-side push and
  // not a document load.
  const router = useRouter();
  const routerRef = useRef(router);
  const init = useCallback(
    (content: HTMLElement) =>
      initClientsContent(content, {
        entries: seedRef.current,
        navigate: (href) => routerRef.current.push(href as Route),
      }),
    [],
  );
  useBlueprintContent(init);

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

      {/* CREATE / EDIT DIALOG — opened by #newClientBtn and by the row menu's
          "Edit client", wired in clients-behavior. Static markup (not injected)
          so it is server-rendered like the rest of the page and the ported
          script only toggles `.open`. The submit button sits in the beige foot,
          OUTSIDE the scrolling body, and reaches the form through
          `form="cNewForm"`. The kicker, title and button label are the only
          things the two modes change. */}
      <div className="mdl" id="cNew" role="dialog" aria-modal="true" aria-labelledby="cNewTitle">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          <div className="mdl-head">
            <div>
              <span className="mdl-kick" id="cNewKick">CRM / new record</span>
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
              {/* Phone stands where the donor put a free-text Tags box. Tags are
                  a separate org-scoped table (Tag / ClientTag) with no write
                  path in src/actions/clients.ts, so that box could only ever
                  swallow what was typed into it. Phone is a real Client column
                  the classic form already wrote, so this input persists. */}
              <div className="fld">
                <label className="fld-lbl" htmlFor="cfPhone">Phone</label>
                <input
                  className="pinput"
                  id="cfPhone"
                  name="phone"
                  type="tel"
                  placeholder="(425) 555-0134"
                  autoComplete="off"
                />
              </div>
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
              <span className="fld-hint">City, state — the Location column and the address on their proposals.</span>
            </div>

            <div className="fld" id="cfVipFld">
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

          {/* createClient / updateClient reject with messages written for the
              user ("Name is required", "Client not found"). They land here
              rather than the dialog closing on a write that never happened. */}
          <div className="mf-err mf-err--boxed is-hidden" id="cNewErr" role="alert"></div>

          <div className="mdl-foot">
            <button className="btn btn-ghost" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" form="cNewForm" id="cNewSave">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              <span data-save-lbl>Create client</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
