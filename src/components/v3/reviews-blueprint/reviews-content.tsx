"use client";

// Blueprint reviews — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-reviews-blueprint_3.html); the sidebar, topbar and the
// 42-symbol sprite come from the shared shell (components/v3/blueprint-shell),
// which persists across navigation. Dynamic regions (#statGrid, #rvFilters,
// #rvList, #spread, #pendList, #pendCount and #pMenu) are left empty exactly
// like the donor and filled by the ported script on mount — same architecture,
// same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initReviewsContent } from "./reviews-behavior";
import { ReviewsSprite } from "./sprite";

export function ReviewsContent() {
  useBlueprintContent(initReviewsContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Reputation</div>
          <h1 className="page-title">Reviews</h1>
        </div>
      </div>

      <div className="stat-grid" id="statGrid"></div>

      <div className="rv-grid">
        {/* review feed */}
        <div className="card rv-card">
          <div className="rv-head">
            <div>
              <div className="card-title">Recent reviews</div>
              <div className="card-sub">Completed submissions come through here</div>
            </div>
            <div className="rv-filters" id="rvFilters"></div>
          </div>
          <ul className="rv-list" id="rvList"></ul>
          <div className="rv-empty is-hidden" id="rvEmpty">
            <svg className="ic">
              <use href="#i-thumb" />
            </svg>
            <b>No reviews yet</b>
            <span>Mark a job as completed and the client gets a review link. Their submission appears here.</span>
          </div>
        </div>

        {/* score spread + awaiting */}
        <aside className="rv-side">
          <div className="card rv-card">
            <div className="rv-head"><div className="card-title">Score spread</div></div>
            <div className="spread" id="spread"></div>
          </div>

          <div className="card rv-card">
            <div className="rv-head">
              <div className="card-title">Awaiting response</div>
              <span className="pstatus rv-count" id="pendCount">0</span>
            </div>
            <ul className="pend" id="pendList"></ul>
            <div className="pend-empty is-hidden" id="pendEmpty">Every request has been answered.</div>
          </div>
        </aside>
      </div>
      <div className="pmenu" id="pMenu"></div>

      <ReviewsSprite />
    </>
  );
}
