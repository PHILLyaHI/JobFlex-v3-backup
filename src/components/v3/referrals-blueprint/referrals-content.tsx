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
//
// The donor's hardcoded "BELL-4T9K" is gone: the code and both share links are
// the org's real ones, read in the server component. They live in the static
// JSX (not in a behavior-built string) because they never change for the life
// of the mount — the only region the script rewrites is the conversion list.

import { useCallback, useRef } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initReferralsContent } from "./referrals-behavior";
import type { Conversion } from "./referrals-data";

export type ReferralsContentProps = {
  /** `ReferralCode.code` — the shareable string itself. */
  code: string;
  /** Contractor signup link with `?ref=` (30-day capture). */
  signupUrl: string;
  /** Homeowner lead-funnel link with `?ref=`. */
  homeownerUrl: string;
  /** Most recent 40 conversions, newest first. */
  conversions: Conversion[];
  /** Every conversion ever recorded against the code — the list is capped, this
   *  is not, so "Code uses / All time" stays honest past 40. */
  uses: number;
  /** CONVERTED + PAID. */
  convertedCount: number;
  pendingCount: number;
  /** CONVERTED-but-not-yet-credited — the "N credits on the way" hint. */
  onTheWayCount: number;
  /** Sum of `rewardCents` across PAID conversions. */
  creditedCents: number;
};

export function ReferralsContent(props: ReferralsContentProps) {
  const { code, signupUrl, homeownerUrl } = props;

  // The server data reaches `init` through a ref, NOT through the callback's
  // deps. `useBlueprintContent` re-runs whenever `init` changes identity, and a
  // re-run tears the page down and replays the whole reveal cascade — so the
  // init has to stay referentially stable for the life of the mount.
  //
  // The ref is never written after creation, and it does not need to be: it is
  // seeded on the first render and the layout effect that reads it runs against
  // that same commit. A navigation away unmounts the component, so the next
  // visit gets a fresh ref holding freshly-queried rows.
  const seedRef = useRef(props);

  const init = useCallback(
    (content: HTMLElement) =>
      initReferralsContent(content, {
        conversions: seedRef.current.conversions,
        uses: seedRef.current.uses,
        convertedCount: seedRef.current.convertedCount,
        pendingCount: seedRef.current.pendingCount,
        onTheWayCount: seedRef.current.onTheWayCount,
        creditedCents: seedRef.current.creditedCents,
        code: seedRef.current.code,
        signupUrl: seedRef.current.signupUrl,
      }),
    [],
  );
  useBlueprintContent(init);

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
            <button className="code-val" type="button" id="codeVal" title="Click to copy">{code}</button>
            <button className="code-copy" type="button" data-copy={code} data-copy-src="codeVal" aria-label="Copy code"><svg className="ic"><use href="#i-dup" /></svg></button>
          </div>
          <p className="hero-note">Share your code with other contractors. Each one who upgrades to a paid plan
            knocks 50% off a month of your own subscription — two referrals, two half-price months.</p>
          <div className="hero-links">
            <div className="link-chip">
              <span className="chip-lbl">Signup</span>
              <code id="signupUrl">{signupUrl}</code>
              <button className="chip-copy" type="button" data-copy={signupUrl} data-copy-src="signupUrl" aria-label="Copy signup link"><svg className="ic"><use href="#i-dup" /></svg></button>
            </div>
            <div className="link-chip">
              <span className="chip-lbl">Homeowners</span>
              <code id="homeownerUrl">{homeownerUrl}</code>
              <button className="chip-copy" type="button" data-copy={homeownerUrl} data-copy-src="homeownerUrl" aria-label="Copy homeowner link"><svg className="ic"><use href="#i-dup" /></svg></button>
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
