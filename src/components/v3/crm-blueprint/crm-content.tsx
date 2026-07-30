"use client";

// Blueprint CRM — page CONTENT only. The donor's `.content` children
// (jobflex-crm-blueprint_1.html), verbatim; the sidebar, topbar and SVG sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. The donor's sprite is byte-identical to the shell's, so
// no local copy is needed.
//
// Dynamic regions (#statGrid, #freshList, #actionList, #recentList, #cbTiles,
// #cbChips, #cbCaption, #cbBody, #ruleForm, #rulesList, #queueBody,
// #queuePager) are left empty exactly like the donor and filled by the ported
// script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initCrmContent } from "./crm-behavior";

export function CrmContent() {
  useBlueprintContent(initCrmContent);

  return (
    <>
      {/* PAGE HEAD */}
      <div className="page-head">
        <div>
          <div className="kicker">Pipeline</div>
          <h1 className="page-title">CRM</h1>
        </div>
      </div>

      {/* CRM TABS: Overview · Customer book · Workflows · Follow-up queue */}
      <nav className="crm-tabs" id="crmTabs">
        <button className="crm-tab active" type="button" data-tab="overview">
          <svg className="ic">
            <use href="#i-grid" />
          </svg>
          Overview
        </button>
        <button className="crm-tab" type="button" data-tab="customers">
          <svg className="ic">
            <use href="#i-users" />
          </svg>
          Customer book
        </button>
        <button className="crm-tab" type="button" data-tab="workflows">
          <svg className="ic">
            <use href="#i-crm" />
          </svg>
          Workflows
        </button>
        <button className="crm-tab" type="button" data-tab="queue">
          <svg className="ic">
            <use href="#i-cal" />
          </svg>
          Follow-up queue
          <span className="crm-tab-n" id="queueTabN">
            0
          </span>
        </button>
      </nav>

      {/* ========== OVERVIEW ========== */}
      <section className="ppanel" data-panel="overview">
        <div className="stat-grid" id="statGrid"></div>

        <div className="crm-cols">
          <div className="card">
            <div className="card-head">
              <div className="card-titles">
                <div className="card-title">Fresh leads</div>
                <div className="card-sub">Latest five — claim or route.</div>
              </div>
            </div>
            <ul className="fresh" id="freshList"></ul>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-titles">
                <div className="card-title">What needs you</div>
                <div className="card-sub">Pinch points worth acting on.</div>
              </div>
            </div>
            <ul className="actions" id="actionList"></ul>
            <div className="recent">
              <div className="kpi-lbl">Recent activity</div>
              <ul className="recent-list" id="recentList"></ul>
            </div>
          </div>
        </div>
      </section>

      {/* ========== CUSTOMER BOOK ========== */}
      <section className="ppanel is-hidden" data-panel="customers">
        <div className="cb-tiles" id="cbTiles"></div>
        <div className="cb-filters">
          <div className="cb-chips" id="cbChips"></div>
          <span className="cb-caption" id="cbCaption"></span>
        </div>
        <div className="card card--table">
          <table className="ptable cb-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Top status</th>
                <th className="num">Quotes</th>
                <th className="num">Quoted value</th>
                <th className="num">Lifetime value</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody id="cbBody"></tbody>
          </table>
        </div>
      </section>

      {/* ========== WORKFLOWS ========== */}
      <section className="ppanel is-hidden" data-panel="workflows">
        <div className="card">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Follow-up rules</div>
              <div className="card-sub">
                Auto-schedule a follow-up when a proposal hits a status. Variables like{" "}
                <code>{"{{client_name}}"}</code> and <code>{"{{link}}"}</code> are substituted at
                send.
              </div>
            </div>
            <button className="btn btn-ghost newrule-btn" type="button" id="newRuleBtn">
              <svg className="ic">
                <use href="#i-plus" />
              </svg>
              New rule
            </button>
          </div>
          <div className="rule-form is-hidden" id="ruleForm"></div>
          <ul className="rules" id="rulesList"></ul>
          <div className="pempty is-hidden" id="rulesEmpty">
            <b>No rules yet</b>
            <br />
            Create one to start automating reminders.
          </div>
        </div>
      </section>

      {/* ========== FOLLOW-UP QUEUE ========== */}
      <section className="ppanel is-hidden" data-panel="queue">
        <div className="ptabs" id="qTabs">
          <button className="ptab active" type="button" data-q="ALL">
            All
            <span className="ptab-count" data-qn="ALL">
              0
            </span>
          </button>
          <button className="ptab" type="button" data-q="DUE">
            Due now
            <span className="ptab-count" data-qn="DUE">
              0
            </span>
          </button>
          <button className="ptab" type="button" data-q="SCHEDULED">
            Scheduled
            <span className="ptab-count" data-qn="SCHEDULED">
              0
            </span>
          </button>
        </div>
        <div className="card card--table" id="queueCard">
          <table className="ptable q-table">
            <thead>
              <tr>
                <th>Follow-up</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th className="th-open"></th>
              </tr>
            </thead>
            <tbody id="queueBody"></tbody>
          </table>
        </div>
        <div className="pempty is-hidden" id="queueEmpty">
          <b>Queue is clear</b>
          <br />
          Follow-ups are scheduled by your workflow rules. When proposals trigger them,
          they&apos;ll land here.
        </div>
        <div className="pager" id="queuePager"></div>
      </section>

      <div className="pmenu" id="pMenu"></div>
    </>
  );
}
