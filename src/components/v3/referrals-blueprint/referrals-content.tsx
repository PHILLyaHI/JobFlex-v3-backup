"use client";

// Blueprint referrals — page CONTENT only. The donor's `.content` children,
// verbatim (jobflex-referrals-blueprint_1.html); the sidebar, topbar and sprite
// come from the shared shell (components/v3/blueprint-shell), which persists
// across navigation. Dynamic regions (#statGrid, #rfFilters, #convList) are
// left empty exactly like the donor and filled by the ported script on mount —
// same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// The donor sprite is a subset of the shell sprite (all 42 symbols match by id
// AND geometry), so this page ships no sprite of its own.

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initReferralsContent } from "./referrals-behavior";

export function ReferralsContent() {
  useBlueprintContent(initReferralsContent);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Growth</div>
          <h1 className="page-title">Referrals</h1>
        </div>
      </div>

      {/* CODE CARD */}
      <div className="card hero">
        <div className="hero-main">
          <div className="kpi-lbl">Your code</div>
          <div className="hero-code">
            <button className="code-val" type="button" id="codeVal" title="Click to copy">BELL-4T9K</button>
            <button className="code-copy" type="button" data-copy="BELL-4T9K" aria-label="Copy code"><svg className="ic"><use href="#i-dup" /></svg></button>
          </div>
          <p className="hero-note">Share your code with other contractors. Each one who upgrades to a paid plan
            knocks 50% off a month of your own subscription — two referrals, two half-price months.</p>
          <div className="hero-links">
            <div className="link-chip">
              <span className="chip-lbl">Signup</span>
              <code>jobflex.app/auth/register?ref=BELL-4T9K</code>
              <button className="chip-copy" type="button" data-copy="signup" aria-label="Copy signup link"><svg className="ic"><use href="#i-dup" /></svg></button>
            </div>
            <div className="link-chip">
              <span className="chip-lbl">Homeowners</span>
              <code>jobflex.app/homeowners?ref=BELL-4T9K</code>
              <button className="chip-copy" type="button" data-copy="homeowners" aria-label="Copy homeowner link"><svg className="ic"><use href="#i-dup" /></svg></button>
            </div>
            <button className="btn btn-ghost btn--sm" type="button" id="shareBtn"><svg className="ic"><use href="#i-send" /></svg>Share</button>
          </div>
        </div>
        <div className="hero-side">
          <div className="reward">
            <div className="kpi-lbl">Reward</div>
            <div className="reward-v">50<span>%</span></div>
            <div className="reward-h">off one month, per paid referral</div>
          </div>
        </div>
      </div>

      <div className="stat-grid" id="statGrid"></div>

      <div className="card rf-card">
        <div className="rf-head">
          <div>
            <div className="card-title">Conversions</div>
            <div className="card-sub">People who&apos;ve used your code</div>
          </div>
          <div className="rf-filters" id="rfFilters"></div>
        </div>
        <ul className="conv" id="convList"></ul>
        <div className="rf-empty is-hidden" id="convEmpty">
          <svg className="ic"><use href="#i-gift" /></svg>
          <b>No conversions yet</b>
          <span>Share your code — conversions appear here as soon as someone signs up with it.</span>
        </div>
      </div>
      <div className="pmenu" id="pMenu"></div>
    </>
  );
}
