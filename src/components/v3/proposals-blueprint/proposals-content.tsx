"use client";

// Blueprint proposals — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar and sprite come from the shared shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (#pMast, the table body, the accepted/completed stacks, the pagers
// and #pMenu) are left empty exactly like the donor and filled by the ported
// script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initProposalsContent } from "./proposals-behavior";

export function ProposalsContent() {
  useBlueprintContent(initProposalsContent);

  return (
    <>
      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker">Sales · Documents</div>
          <h1 className="page-title">Proposals</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary">
            <svg className="ic">
              <use href="#i-bulb" />
            </svg>
            Smart Proposal
          </button>
          <button className="btn btn-ghost">
            <svg className="ic">
              <use href="#i-file" />
            </svg>
            Manual proposal
          </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="pmast" id="pMast"></div>

      {/* TABS */}
      <div className="ptabs" id="pTabs">
        <button className="ptab active" type="button" data-tab="all">
          All<span className="ptab-count" data-count="all">0</span>
        </button>
        <button className="ptab" type="button" data-tab="accepted">
          Accepted<span className="ptab-count" data-count="accepted">0</span>
        </button>
        <button className="ptab" type="button" data-tab="completed">
          Completed<span className="ptab-count" data-count="completed">0</span>
        </button>
      </div>

      {/* TAB: ALL */}
      <section className="ppanel" data-panel="all">
        <div className="pchips" id="pChips">
          <button className="pchip active" type="button" data-f="ALL">
            All <b data-cf="ALL">0</b>
          </button>
          <button className="pchip" type="button" data-f="DRAFT">
            Draft <b data-cf="DRAFT">0</b>
          </button>
          <button className="pchip" type="button" data-f="SENT">
            Sent <b data-cf="SENT">0</b>
          </button>
          <button className="pchip" type="button" data-f="VIEWED">
            Viewed <b data-cf="VIEWED">0</b>
          </button>
          <button className="pchip" type="button" data-f="DECLINED">
            Declined <b data-cf="DECLINED">0</b>
          </button>
          <button className="pchip" type="button" data-f="EXPIRED">
            Expired <b data-cf="EXPIRED">0</b>
          </button>
        </div>
        <div className="card card--table" id="allCard">
          <table className="ptable">
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Updated</th>
                <th className="num">Views</th>
                <th>Owner</th>
                <th className="th-open"></th>
              </tr>
            </thead>
            <tbody id="propTableBody"></tbody>
          </table>
        </div>
        <div className="pempty is-hidden" id="allEmpty">
          No proposals match this filter
        </div>
        <div className="pager" id="allPager"></div>
      </section>

      {/* TAB: ACCEPTED */}
      <section className="ppanel is-hidden" data-panel="accepted">
        <div className="pstack" id="propStack"></div>
        <div className="pempty is-hidden" id="accEmpty">
          No accepted contracts yet — send a proposal to get one signed
        </div>
        <div className="pager" id="accPager"></div>
      </section>

      {/* TAB: COMPLETED */}
      <section className="ppanel is-hidden" data-panel="completed">
        <div className="psheets" id="doneStack"></div>
        <div className="pempty is-hidden" id="doneEmpty">
          Nothing filed yet — completed jobs land here
        </div>
        <div className="pager" id="donePager"></div>
      </section>

      <div className="pmenu" id="pMenu"></div>
    </>
  );
}
