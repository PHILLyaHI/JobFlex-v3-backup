"use client";

// Blueprint financials — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar, base sprite and graph-paper field come from
// the shared shell (components/v3/blueprint-shell), which persists across
// navigation. Dynamic regions (#chartTotals, #revChart, #gauge, #gaugeFoot,
// #statGrid, #attList, #rcStaged and the three table bodies) are left empty
// exactly like the donor and filled by the ported script on mount — same
// architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initFinancialsContent, type FinancialsJob } from "./financials-behavior";
import type { ChangeOrder, Expense, Invoice, MonthPoint, Rollup } from "./financials-data";
import { FinancialsSprite } from "./sprite";

export type FinancialsContentProps = {
  /** The org's real jobs. Receipt capture books an expense against one of
   *  these, so the picker cannot be a fixture — the id it submits has to
   *  exist. */
  jobs: FinancialsJob[];
  monthly: MonthPoint[];
  rollup: Rollup;
  expenses: Expense[];
  orders: ChangeOrder[];
  invoices: Invoice[];
};

export function FinancialsContent(props: FinancialsContentProps) {
  // Reaches `init` through a write-once ref, NOT the callback's deps:
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade. Same contract as
  // the Workers page — which is why the whole payload goes through ONE ref
  // rather than six.
  const dataRef = useRef(props);
  const init = useCallback((content: HTMLElement) => {
    const d = dataRef.current;
    return initFinancialsContent(content, {
      jobs: d.jobs,
      monthly: d.monthly,
      rollup: d.rollup,
      expenses: d.expenses,
      orders: d.orders,
      invoices: d.invoices,
    });
  }, []);
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Money</div>
          <h1 className="page-title">Financials</h1>
        </div>
      </div>

      <nav className="fi-tabs" id="fiTabs">
        <button className="fi-tab active" type="button" data-tab="overview">
          <svg className="ic">
            <use href="#i-grid" />
          </svg>
          Overview
        </button>
        <button className="fi-tab" type="button" data-tab="expenses">
          <svg className="ic">
            <use href="#i-receipt" />
          </svg>
          Expenses
        </button>
        <button className="fi-tab" type="button" data-tab="orders">
          <svg className="ic">
            <use href="#i-pen" />
          </svg>
          Change orders
        </button>
        <button className="fi-tab" type="button" data-tab="invoices">
          <svg className="ic">
            <use href="#i-file" />
          </svg>
          Invoices
        </button>
      </nav>

      {/* ========== OVERVIEW ========== */}
      <section className="ppanel" data-panel="overview">
        <div className="fi-band">
          <div className="card fi-card">
            <div className="fi-head">
              <div>
                <div className="kpi-lbl">Revenue vs Expenses</div>
                {/* The scope line doubles as the chart's hover readout: point at
                    a month and it names that month while #chartTotals switches
                    to its figures. Filled by the behavior module. */}
                <div className="fi-sub" id="chartScope"></div>
              </div>
              <div className="fi-headstats" id="chartTotals"></div>
            </div>
            <div className="fi-chart" id="revChart"></div>
            <div className="fi-legend">
              <span>
                <i className="sw-rev"></i>Revenue
              </span>
              <span>
                <i className="sw-exp"></i>Expenses
              </span>
              <span>
                <i className="net"></i>Net
              </span>
            </div>
          </div>

          <div className="card fi-card fi-gauge">
            <div className="fi-head">
              <div className="kpi-lbl">Profit margin</div>
              <span className="pstatus" id="marginTone"></span>
            </div>
            <div className="gauge-wrap" id="gauge"></div>
            <div className="gauge-foot" id="gaugeFoot"></div>
          </div>
        </div>

        <div className="stat-grid" id="statGrid"></div>

        <div className="fi-two">
          <div className="card fi-card">
            <div className="fi-head">
              <div>
                <div className="kpi-lbl">Receipt capture</div>
                <div className="fi-sub">Drop a receipt image — vendor, total and category are read off it and staged as an expense for your review.</div>
              </div>
              <svg className="ic fi-head-ic">
                <use href="#i-receipt" />
              </svg>
            </div>
            {/* The drop zone is a real upload now: the hidden input is what a
                click opens, and a drag-and-drop reaches the same handler. Both
                paths run the file through `scanReceipt` and stage the result
                against a real job. */}
            <div className="rc-body">
              <button className="rc-drop" type="button" id="rcDrop">
                <svg className="ic">
                  <use href="#i-imgadd" />
                </svg>
                <span className="rc-t">Drop a receipt or click to upload</span>
                <span className="rc-h">JPG or PNG · read, then charged to a job</span>
              </button>
              <input
                type="file"
                id="rcFile"
                accept="image/png,image/jpeg,image/webp"
                className="is-hidden"
              />
              {/* Progress and failure both land here — "Reading the receipt…",
                  "Vision is off, so these are placeholder values", or the
                  server action's own message. */}
              <div className="rc-note is-hidden" id="rcNote" role="status"></div>
              <div className="rc-staged is-hidden" id="rcStaged"></div>
            </div>
          </div>

          <div className="card fi-card">
            <div className="fi-head">
              <div>
                <div className="kpi-lbl">Attention</div>
                <div className="fi-sub">What needs you this week.</div>
              </div>
            </div>
            <ul className="att-list" id="attList"></ul>
          </div>
        </div>
      </section>

      {/* ========== EXPENSES ========== */}
      <section className="ppanel is-hidden" data-panel="expenses">
        <div className="card card--table">
          <div className="tb-head">
            <span className="kpi-lbl">Job expenses</span>
            <span className="tb-total" id="expTotal"></span>
          </div>
          {/* A refused write says so here rather than the row silently staying
              put — `deleteJobExpense` throws "Not found" for anything outside
              the org, and the server is manager-gated. */}
          <div className="fi-tnote is-hidden" id="expNote" role="alert"></div>
          <table className="ptable fi-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Category</th>
                <th>Note</th>
                <th>Logged</th>
                <th className="num">Amount</th>
                <th className="th-open"></th>
              </tr>
            </thead>
            <tbody id="expBody"></tbody>
          </table>
        </div>
        <div className="pempty is-hidden" id="expEmpty">
          <b>No expenses yet</b>
          <br />
          Drop a receipt above or add one manually from any job&apos;s Expenses tab.
        </div>
      </section>

      {/* ========== CHANGE ORDERS ========== */}
      <section className="ppanel is-hidden" data-panel="orders">
        <div className="card card--table">
          <div className="tb-head">
            <span className="kpi-lbl">Change orders</span>
            <span className="tb-total" id="coTotal"></span>
          </div>
          {/* `sendChangeOrder` refuses anything that is not a DRAFT, and
              `deleteChangeOrder` the same — both messages are written for the
              user, so they are shown verbatim. */}
          <div className="fi-tnote is-hidden" id="coNote" role="alert"></div>
          <table className="ptable fi-table">
            <thead>
              <tr>
                <th>Change order</th>
                <th>Job</th>
                <th>Status</th>
                <th>Created</th>
                <th className="num">Amount</th>
                <th className="th-open"></th>
              </tr>
            </thead>
            <tbody id="coBody"></tbody>
          </table>
        </div>
        <div className="pempty is-hidden" id="coEmpty">
          <b>No change orders yet</b>
          <br />
          Raise one from a job when scope grows.
        </div>
      </section>

      {/* ========== INVOICES ========== */}
      <section className="ppanel is-hidden" data-panel="invoices">
        <div className="card card--table">
          <div className="tb-head">
            <span className="kpi-lbl">Invoices</span>
            <span className="tb-total" id="invTotal"></span>
          </div>
          <table className="ptable fi-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Due</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody id="invBody"></tbody>
          </table>
        </div>
        <div className="pempty is-hidden" id="invEmpty">
          <b>No invoices yet</b>
          <br />
          Invoices appear when a proposal is accepted and billed.
        </div>
      </section>

      <div className="pmenu" id="pMenu"></div>

      {/* Deleting an expense or a draft change order is a real, irreversible
          database write, so it goes through a confirmation the same way the
          classic tables' `confirm()` did — as a blueprint dialog rather than a
          browser prompt. One dialog serves both books; the behavior module
          retitles it and remembers which row is pending.

          It lives inside `.content` (it is position:fixed, so layout is
          unaffected) and is skipped by the reveal cascade — see the
          `:not(.mdl)` in financials-behavior. */}
      <div className="mdl" id="fiConfirm">
        <div className="mdl-bg" data-mdl-close></div>
        <div className="mdl-box">
          <div className="mdl-head mdl-head--row">
            <span id="fiConfirmTitle">Delete?</span>
            <button className="mdl-x" type="button" data-mdl-close aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <div className="mdl-txt" id="fiConfirmTxt"></div>
          <div className="fi-tnote fi-tnote--boxed is-hidden" id="fiConfirmErr" role="alert"></div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl-close>
              Cancel
            </button>
            <button className="btn btn-primary btn--sm" type="button" id="fiConfirmOk">
              <svg className="ic">
                <use href="#i-trash" />
              </svg>
              <span data-save-lbl>Delete</span>
            </button>
          </div>
        </div>
      </div>

      <FinancialsSprite />
    </>
  );
}
