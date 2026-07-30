"use client";

// Blueprint trade board — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-trade-board-blueprint.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#cats, #postList, #infStats, #stmtBody,
// #payBody and #pMenu) are left empty exactly like the donor and filled by the
// ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural adaptation: the donor mounts the "New trade post" dialog
// (#postMdl) as a sibling of `.main`, which this page has no access to, so it
// ships as the LAST child of `.content`. It is `position: fixed`, so it takes
// no part in the flex flow; the stacking-context fix and the reveal-cascade
// exclusion it needs are documented in trade.module.css and trade-behavior.ts.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initTradeContent } from "./trade-behavior";

export function TradeContent() {
  useBlueprintContent(initTradeContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Community</div>
          <h1 className="page-title">Trade board</h1>
        </div>
      </div>

      <nav className="td-tabs" id="tdTabs">
        <button className="td-tab active" type="button" data-tab="posts">
          <svg className="ic">
            <use href="#i-msg" />
          </svg>
          Posts<span className="td-tab-n" id="postsN">0</span>
        </button>
        <button className="td-tab" type="button" data-tab="influencers">
          <svg className="ic">
            <use href="#i-megaphone" />
          </svg>
          Influencers
        </button>
      </nav>

      {/* ========== POSTS ========== */}
      <section className="ppanel" data-panel="posts">
        <div className="td-bar">
          <div className="cats" id="cats"></div>
          <button className="btn btn-primary btn--sm" type="button" id="newPostBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New post
          </button>
        </div>
        <div className="posts" id="postList"></div>
        <div className="td-empty is-hidden" id="postEmpty">
          <svg className="ic">
            <use href="#i-msg" />
          </svg>
          <b>No posts here</b>
          <span>Nothing in this category yet — start the thread.</span>
          <button className="btn btn-primary btn--sm" type="button" id="emptyPostBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New post
          </button>
        </div>
      </section>

      {/* ========== INFLUENCERS ========== */}
      <section className="ppanel is-hidden" data-panel="influencers">
        <div className="stat-grid" id="infStats"></div>

        <div className="card td-card">
          <div className="td-head">
            <div>
              <div className="card-title">Statements · <span id="periodLabel">—</span></div>
              <div className="card-sub">Per-influencer rollup for the current period.</div>
            </div>
          </div>
          <table className="ptable td-table">
            <thead>
              <tr>
                <th>Influencer</th>
                <th className="num">Clicks</th>
                <th className="num">Conversions</th>
                <th className="num">Rate</th>
                <th className="num">Earnings</th>
              </tr>
            </thead>
            <tbody id="stmtBody"></tbody>
          </table>
        </div>

        <div className="card td-card">
          <div className="td-head">
            <div>
              <div className="card-title">Payouts</div>
              <div className="card-sub">Payment history across all periods.</div>
            </div>
          </div>
          <table className="ptable td-table">
            <thead>
              <tr>
                <th>Influencer</th>
                <th>Period</th>
                <th>Method</th>
                <th>Status</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody id="payBody"></tbody>
          </table>
        </div>
      </section>
      <div className="pmenu" id="pMenu"></div>

      {/* NEW TRADE POST DIALOG — donor markup verbatim. The donor's
          `<option value="question" selected>` becomes `defaultValue` on the
          <select>, React's spelling for the identical initial selection. */}
      <div className="mdl" id="postMdl">
        <div className="mdl-bg" data-mdl="close"></div>
        <div className="mdl-box">
          {/* Corner dismiss, matching the create dialogs on Jobs / Clients /
              Projects. The scrim and Cancel were the only ways out. */}
          <div className="mdl-head">
            <div>
              <div className="mdl-title">New trade post</div>
              <div className="mdl-sub">Be specific — title in one line, details in the body.</div>
            </div>
            <button className="mdl-x" type="button" data-mdl="close" aria-label="Close dialog">
              <svg className="ic">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          <div className="mdl-body">
            <label className="tf">
              <span className="tf-lbl">Title</span>
              <input className="tf-in" id="postTitle" placeholder="Selling a 2019 dump trailer" />
            </label>
            <label className="tf">
              <span className="tf-lbl">Body</span>
              <textarea
                className="tf-area"
                id="postBody"
                placeholder="Condition, price, location, who to call…"
              />
            </label>
            <label className="tf">
              <span className="tf-lbl">Category</span>
              <select className="tf-in" id="postCat" defaultValue="question">
                <option value="equipment">Equipment</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="job-share">Job share</option>
                <option value="question">Question</option>
              </select>
            </label>
          </div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary btn--sm" type="button" id="publishPost">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              Post
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
