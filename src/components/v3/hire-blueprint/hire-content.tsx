"use client";

// Blueprint hire — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar, sprite and graph-paper field come from the
// shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#hubDoors, #tallyRow, #hubList, #hkBoard,
// #profBox, #talentBox and #sheetBody) are left empty exactly like the donor
// and filled by the ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural note: in the donor, `#sheetBg` / `#sheet` sit OUTSIDE
// `.content` (children of `.layout`, which the shared shell owns here), so
// they ship as the last members of this fragment instead. Both are
// `position: fixed`, so they take no part in `.content`'s flex flow; the
// stacking consequence of moving them inside a `z-index: 1` ancestor is
// undone by the one escape-hatch rule in hire-global.css, and the reveal
// cascade skips them in hire-behavior.ts — together those reproduce the
// donor's paint order and motion exactly.

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import type { DiscoverProfileDTO } from "@/actions/tradeServices";
import type { TradeNetworkProfileDTO } from "@/app/(mobile)/trade-services/trade-data";
import { initHireContent } from "./hire-behavior";
import type { Applicant, HireTallies } from "./hire-data";
import "./hire-global.css";

/**
 * @param applicants the org's real pipeline, read in the page's server
 *   component. The behavior module takes it as its starting state and then
 *   keeps itself in step with the database through the applicant server
 *   actions.
 * @param profile   the caller's TradeNetworkProfile ("Publish your profile").
 * @param tallies   the hub's real activity numbers — see HireTallies.
 * @param talent    other orgs' opted-in profiles ("Discover talent").
 */
export function HireContent({
  applicants,
  profile,
  tallies,
  talent,
}: {
  applicants?: Applicant[];
  profile?: TradeNetworkProfileDTO;
  tallies?: HireTallies;
  talent?: DiscoverProfileDTO[];
}) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a
  // re-run tears the page down and replays the whole reveal cascade — so the
  // init has to stay referentially stable for the life of the mount.
  //
  // The ref is never written after creation, and it does not need to be: it is
  // seeded on the first render, the layout effect that reads it runs against
  // that same commit, and from then on the behavior module owns the pipeline
  // and keeps itself in step with the database through the server actions. A
  // navigation away unmounts the component, so the next visit gets a fresh ref
  // holding freshly-queried rows.
  const seedRef = useRef({ applicants, profile, tallies, talent });

  // Cross-route rows ("Job posts", "Applications") leave through router.push —
  // a hard navigation replays the shell's entrance and double-takes (see the
  // clients port for the long version). Same contract as clients-content.tsx:
  // `useRouter` returns the same object for the life of the mount, so seeding
  // the ref once is enough — and writing to a ref during render is not allowed.
  const router = useRouter();
  const routerRef = useRef(router);

  const init = useCallback(
    (content: HTMLElement) =>
      initHireContent(content, {
        ...seedRef.current,
        navigate: (href) => routerRef.current.push(href as Route),
      }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      {/* ===== ROUTE: /dashboard/hire/hub ===== */}
      <section className="ppanel" data-panel="hub">
        <div className="page-head">
          <div>
            <div className="kicker">Marketplace</div>
            <h1 className="page-title">Hire &amp; Work</h1>
          </div>
        </div>

        {/* two doors in one card, split by a hairline */}
        <div className="card hub-doors" id="hubDoors"></div>

        {/* Your activity */}
        <div className="card hub-tally">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Your activity</div>
            </div>
            <button className="hub-viewall" type="button" data-goto="pipeline">
              View pipeline{" "}
              <svg className="ic">
                <use href="#i-arrow" />
              </svg>
            </button>
          </div>
          <div className="tally-row" id="tallyRow"></div>
        </div>

        {/* Go deeper */}
        <div className="card hub-links">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Go deeper</div>
            </div>
          </div>
          <ul className="hub-list" id="hubList"></ul>
        </div>
      </section>

      {/* ===== ROUTE: /dashboard/hire (applicant pipeline) ===== */}
      <section className="ppanel is-hidden" data-panel="pipeline">
        <button className="back-link" type="button" data-goto="hub">
          <svg className="ic rot-l">
            <use href="#i-chev" />
          </svg>
          Hire &amp; Work
        </button>
        <div className="page-head">
          <div>
            <div className="kicker">Workforce</div>
            <h1 className="page-title">Hire</h1>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" id="addApplicantBtn">
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              Add applicant
            </button>
          </div>
        </div>

        {/* A stage move that the server refuses (permission, a row someone
            else deleted) rolls the card back — this is where the action's own
            message lands, so the rollback is never silent. */}
        <div className="mf-err mf-err--boxed is-hidden" id="hkErr" role="alert"></div>

        <div className="hk-board" id="hkBoard"></div>
        <div className="pempty is-hidden" id="hkEmpty">
          <b>No applicants yet</b>
          <br />
          Add candidates manually or wire your job-board integrations later.
          <div style={{ marginTop: "14px" }}>
            <button className="btn btn-primary btn--sm" type="button" data-act="add">
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              Add first applicant
            </button>
          </div>
        </div>
      </section>

      {/* ===== PANEL: talent directory (Discover talent) ===== */}
      <section className="ppanel is-hidden" data-panel="talent">
        <button className="back-link" type="button" data-goto="hub">
          <svg className="ic rot-l">
            <use href="#i-chev" />
          </svg>
          Hire &amp; Work
        </button>
        <div className="page-head">
          <div>
            <div className="kicker">Marketplace</div>
            <h1 className="page-title">Talent directory</h1>
          </div>
        </div>
        <div className="card hub-talent" id="talentBox"></div>
      </section>

      {/* ===== PANEL: open-for-work profile (Publish your profile) ===== */}
      <section className="ppanel is-hidden" data-panel="profile">
        <button className="back-link" type="button" data-goto="hub">
          <svg className="ic rot-l">
            <use href="#i-chev" />
          </svg>
          Hire &amp; Work
        </button>
        <div className="page-head">
          <div>
            <div className="kicker">Marketplace</div>
            <h1 className="page-title">Your public profile</h1>
          </div>
          <div className="page-actions">
            <span className="pstatus" id="profFlag"></span>
          </div>
        </div>
        <div className="card hub-prof" id="profBox"></div>
      </section>

      <div className="pmenu" id="pMenu"></div>

      {/* Candidate panel — donor overlays, fixed to the viewport */}
      <div className="sheet-bg" id="sheetBg"></div>
      <aside className="sheet" id="sheet">
        <div className="sheet-head">
          <div className="sheet-title" id="sheetTitle">
            —
          </div>
          <button className="sheet-x" type="button" data-sheet="close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="sheet-body" id="sheetBody"></div>
      </aside>
    </>
  );
}
