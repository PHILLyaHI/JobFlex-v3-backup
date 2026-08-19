"use client";

// Blueprint trade board — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-trade-board-blueprint.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#cats, #postList and #pMenu) are left
// empty exactly like the donor and filled by the ported script on mount —
// same architecture, same timing.
//
// DIVERGENCE FROM THE DONOR: the donor's second view — the influencer program
// (stat tiles, per-influencer statements, payouts) — is gone. Influencers now
// live behind their own login at /influencer, which runs real scoped queries
// instead of this page's fixtures. With Posts the only view left, the donor's
// `.td-tabs` strip was one tab wide and has been removed too; the board is
// this page.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// One structural adaptation: the donor mounts the "New trade post" dialog
// (#postMdl) as a sibling of `.main`, which this page has no access to, so it
// ships as the LAST child of `.content`. It is `position: fixed`, so it takes
// no part in the flex flow; the stacking-context fix and the reveal-cascade
// exclusion it needs are documented in trade.module.css and trade-behavior.ts.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initTradeContent } from "./trade-behavior";
import { CATEGORIES, type TradePost } from "./trade-data";

/**
 * @param entries the org's real board, read in the page's server component.
 *   The behavior module takes it as its starting state and then keeps itself in
 *   step with the database through the trade-post server actions.
 */
export function TradeContent({ entries, viewer }: { entries?: TradePost[]; viewer?: string }) {
  // The seed reaches `init` through a ref, NOT through the callback's deps.
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade — so the init has
  // to stay referentially stable for the life of the mount. Same reasoning, and
  // the same shape, as workers-content.tsx.
  const seedRef = useRef({ entries, viewer });

  const init = useCallback(
    (content: HTMLElement) =>
      initTradeContent(content, {
        entries: seedRef.current.entries,
        viewer: seedRef.current.viewer,
      }),
    [],
  );
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Community</div>
          <h1 className="page-title">Trade board</h1>
        </div>
      </div>

      {/* ========== POSTS ========== */}
      {/* No `.ppanel` / `data-panel` here any more: those were switch targets
          for the tab strip, and Posts is the only view. Kept as a <section>
          because the reveal cascade animates `.content > *` as blocks. */}
      <section>
        <div className="td-bar">
          <div className="cats" id="cats"></div>
          {/* No `btn--sm` here (the donor's modifier): the page primary takes
              the base `.btn` fleet standard (40px desktop / 42px mobile), NOT
              the chips' 30px control height beside it. */}
          <button className="btn btn-primary" type="button" id="newPostBtn">
            <svg className="ic">
              <use href="#i-plus" />
            </svg>
            New post
          </button>
        </div>
        <div className="posts" id="postList"></div>
        {/* The donor put a second New post button here (#emptyPostBtn). Removed
            2026-08-12 by owner request: one entry point, the bar's #newPostBtn —
            the empty state only points at it. */}
        <div className="td-empty is-hidden" id="postEmpty">
          <svg className="ic">
            <use href="#i-msg" />
          </svg>
          <b>No posts here</b>
          <span>Nothing in this category yet — start the thread.</span>
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
            <div className="tf">
              <span className="tf-lbl">Category</span>
              {/* The fleet `.dd` dropdown (dashboard chart-range) recut as a
                  form field, replacing the native <select>: its option list is
                  OS chrome and can't take the blueprint treatment. Items carry
                  `data-pcat`, NOT `data-cat` — the board's category chips own
                  that attribute in the page-wide click delegate, and reusing it
                  here would re-filter the board behind the open dialog. The
                  active category lives in trade-behavior.ts (`postCat`). */}
              <div className="dd" id="postCatDd">
                <button className="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                  <span className="cat-dot" data-dd-dot style={{ background: "var(--muted-faint)" }}></span>
                  <span className="dd-div"></span>
                  <span className="dd-label">Question</span>
                  <svg className="ic">
                    <use href="#i-chev" />
                  </svg>
                </button>
                <div className="dd-menu" role="listbox">
                  {CATEGORIES.filter((c) => c.key !== "all").map((c) => (
                    <button
                      key={c.key}
                      className={"dd-item" + (c.key === "question" ? " active" : "")}
                      type="button"
                      role="option"
                      aria-selected={c.key === "question"}
                      data-pcat={c.key}
                    >
                      <span className="cat-dot" style={{ background: c.tone }}></span>
                      <span className="dd-div"></span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* The action's own refusal text (createTradePost is manager-gated and
              org-scoped) lands here rather than in an alert(). Same plate the
              Clients and Workers create dialogs use. */}
          <div className="mf-err mf-err--boxed is-hidden" id="postErr" role="alert"></div>
          <div className="mdl-foot">
            <button className="btn btn-ghost btn--sm" type="button" data-mdl="close">
              Cancel
            </button>
            <button className="btn btn-primary btn--sm" type="button" id="publishPost">
              <svg className="ic">
                <use href="#i-check" />
              </svg>
              <span data-save-lbl>Post</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
