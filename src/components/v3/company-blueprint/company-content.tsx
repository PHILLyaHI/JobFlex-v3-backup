"use client";

// Blueprint company — page CONTENT only. The donor's `.content` children,
// verbatim; the sidebar, topbar and shared sprite come from the shell
// (components/v3/blueprint-shell), which persists across navigation. Dynamic
// regions (#swatches, #mailPrev, #leadState, #trades, #actCats, #actPerson,
// #actFeed and the save lines) are left empty exactly like the donor and
// filled by the ported script on mount — same architecture, same timing.
//
// Returning a fragment keeps these blocks as DIRECT children of `.content`,
// which the donor's reveal cascade (`.content > *`) depends on.
//
// Inputs use `defaultValue` rather than `value`: the donor's fields are
// uncontrolled (its script reads `.value` and the user types into them), and
// React renders `defaultValue` as the same `value` attribute.
//
// This page is NOT a fixture: `org`, `activity` and `members` come from the
// database in app/dashboard/company/page.tsx, and every edit below is written
// back through the company server actions (see company-behavior.ts).

import { useCallback, useRef } from "react";
import Link from "next/link";

import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initCompanyContent } from "./company-behavior";
import type { ActivityEntry, CompanyOrgState, TeamMember } from "./company-data";
import { CompanySprite } from "./sprite";

export type CompanyContentProps = {
  org: CompanyOrgState;
  activity: ActivityEntry[];
  members: TeamMember[];
  /** False for the limited roles (worker / sales / estimator): the company
   *  actions are `requireManager`-guarded, so the sheet reads but can't save. */
  canEdit: boolean;
};

export function CompanyContent({ org, activity, members, canEdit }: CompanyContentProps) {
  // Server data reaches `init` through a ref, NOT through the callback's deps:
  // `useBlueprintContent` re-runs whenever `init` changes identity, and a re-run
  // tears the page down and replays the whole reveal cascade. The ref is never
  // written after creation — it is seeded on the first render, the layout effect
  // that reads it runs against that same commit, and from then on the behavior
  // module owns the state and keeps itself in step with the database through the
  // server actions.
  const seedRef = useRef({ org, activity, members, canEdit });

  const init = useCallback((content: HTMLElement) => initCompanyContent(content, seedRef.current), []);
  useBlueprintContent(init);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Account</div>
          <h1 className="page-title">Company</h1>
        </div>
      </div>

      {/* section tabs: Branding · Team · Team activity · Landing builder */}
      <nav className="co-tabs" id="coTabs">
        <button className="co-tab active" type="button" data-tab="branding">
          <svg className="ic">
            <use href="#i-palette" />
          </svg>
          Branding
        </button>
        <button className="co-tab" type="button" data-tab="team">
          <svg className="ic">
            <use href="#i-users" />
          </svg>
          Team
        </button>
        <button className="co-tab" type="button" data-tab="activity">
          <svg className="ic">
            <use href="#i-chart" />
          </svg>
          Team activity
        </button>
        <button className="co-tab" type="button" data-tab="landing">
          <svg className="ic">
            <use href="#i-globe" />
          </svg>
          Landing builder<span className="co-soon">Soon</span>
        </button>
      </nav>

      {/* ========== BRANDING ========== */}
      <section className="ppanel" data-panel="branding">
        <div className="co-grid">
          <div className="card co-card">
            <div className="card-head">
              <div className="card-titles">
                <div className="card-title">Identity</div>
              </div>
            </div>
            <div className="co-body">
              <div className="co-fields">
                <label className="cf">
                  <span className="cf-lbl">Company name</span>
                  <input className="cf-in" data-b="name" defaultValue={org.name} />
                </label>
                <label className="cf">
                  <span className="cf-lbl">Billing email</span>
                  <input className="cf-in" type="email" data-b="email" defaultValue={org.billingEmail} />
                </label>
                <label className="cf">
                  <span className="cf-lbl">Phone</span>
                  <input className="cf-in" data-b="phone" defaultValue={org.phone} />
                </label>
                <label className="cf">
                  <span className="cf-lbl">Website</span>
                  <input className="cf-in" data-b="site" defaultValue={org.website} />
                </label>
                <label className="cf cf-wide">
                  <span className="cf-lbl">Address</span>
                  <input className="cf-in" data-b="addr" defaultValue={org.address} />
                </label>
              </div>

              <div className="co-color">
                <div className="kpi-lbl">Brand color</div>
                <div className="swatches" id="swatches"></div>
              </div>

              <div className="save-line" id="saveBranding"></div>
            </div>
          </div>

          <div className="co-side">
            <div className="card co-card">
              <div className="card-head">
                <div className="card-titles">
                  <div className="card-title">Logo</div>
                </div>
              </div>
              <div className="co-body">
                {/* The drop target and its file picker. The picker is a real
                    <input type="file"> (a sibling, not a child — an input
                    inside a button is invalid) that the behavior opens on
                    click and on drop; the chosen file is read and saved
                    through updateBranding. */}
                <button className="logo-drop" type="button" id="logoDrop">
                  <svg className="ic">
                    <use href="#i-imgadd" />
                  </svg>
                  <span className="logo-t">Drop or click</span>
                  <span className="logo-h">PNG, JPG, or SVG up to 2 MB</span>
                </button>
                <input className="is-hidden" type="file" accept="image/*" id="logoFile" />
                <div className="save-line" id="saveLogo"></div>
              </div>
            </div>

            <div className="card co-card">
              <div className="card-head">
                <div className="card-titles">
                  <div className="card-title">Live preview</div>
                  <div className="card-sub">Email header sample.</div>
                </div>
              </div>
              <div className="co-body">
                <div className="mail-prev" id="mailPrev"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="card co-card co-lead">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Lead matching</div>
            </div>
            <span className="pstatus" id="leadState"></span>
          </div>
          <div className="co-body">
            <div className="co-fields">
              <label className="cf">
                <span className="cf-lbl">Business address</span>
                <input
                  className="cf-in"
                  data-l="addr"
                  placeholder="Street, city, state, zip"
                  defaultValue={org.address}
                />
              </label>
              <label className="cf">
                <span className="cf-lbl">Phone for lead alerts</span>
                <input className="cf-in" data-l="phone" defaultValue={org.phone} />
              </label>
            </div>
            <div className="co-trades">
              <div className="kpi-lbl">Trades you take</div>
              <div className="trades" id="trades"></div>
            </div>
            <div className="toggle-row">
              <div>
                <div className="tg-t">Accept platform leads</div>
                <div className="tg-h">Turn off to pause new homeowner leads without losing your profile.</div>
              </div>
              <button
                className={"tgl" + (org.leadOffersEnabled ? " on" : "")}
                type="button"
                id="leadToggle"
                aria-label="Accept platform leads"
              ></button>
            </div>
            <div className="save-line" id="saveLead"></div>
          </div>
        </div>
      </section>

      {/* ========== TEAM ========== */}
      <section className="ppanel is-hidden" data-panel="team">
        <div className="card co-card">
          <div className="co-body co-team">
            <div className="co-team-ic">
              <svg className="ic">
                <use href="#i-users" />
              </svg>
            </div>
            <div className="co-team-t">Team lives in the unified roster</div>
            {/* The real member count, so the signpost states a fact rather than
                sending the reader off to find out. */}
            <p className="co-team-p">
              {members.length === 1 ? "1 person" : members.length + " people"} on this workspace. Crew, roles,
              invites and portal links are all managed on the Workers page.
            </p>
            {/* A real anchor, not a `data-flash` button: the donor's flash was a
                placeholder for navigation that never landed, so the control
                announced "Opening" and went nowhere. `.btn` is not
                button-scoped, so the blueprint button treatment applies to the
                link unchanged. */}
            <Link className="btn btn-primary btn--sm" href="/dashboard/workers">
              <svg className="ic">
                <use href="#i-arrow" />
              </svg>
              Open Workers
            </Link>
          </div>
        </div>
      </section>

      {/* ========== TEAM ACTIVITY ========== */}
      <section className="ppanel is-hidden" data-panel="activity">
        <div className="card co-card">
          <div className="act-bar">
            <div className="act-cats" id="actCats"></div>
            <label className="lsearch">
              <svg className="ic">
                <use href="#i-search" />
              </svg>
              <input type="text" id="actSearch" placeholder="Search activity" autoComplete="off" />
            </label>
            {/* Shared blueprint select treatment (blueprint-global.css):
                the wrapper draws the chevron, the control drops the OS one.
                `#actPerson` always has a value, so no `data-empty`. */}
            <span className="bp-sel act-person">
              <select className="bp-sel-in" id="actPerson"></select>
            </span>
          </div>
          <div className="act-feed" id="actFeed"></div>
          <div className="act-more is-hidden" id="actMore">
            <button className="btn btn-ghost btn--sm" type="button" id="actMoreBtn">
              Load more
            </button>
          </div>
          <div className="pempty is-hidden" id="actEmpty">
            <b>No activity yet</b>
            <br />
            Team actions show up here as they happen.
          </div>
        </div>
      </section>

      {/* ========== LANDING BUILDER ========== */}
      <section className="ppanel is-hidden" data-panel="landing">
        <div className="card co-card">
          <div className="card-head">
            <div className="card-titles">
              <div className="card-title">Public profile</div>
            </div>
            <span className="pstatus co-soon-pill">Soon</span>
          </div>
          <div className="co-body">
            <div className="toggle-row">
              <div>
                <div className="tg-t">Publish public profile</div>
                <div className="tg-h">
                  When on, your customizations below appear on the public form. When off, the form falls back to
                  JobFlex defaults.
                </div>
              </div>
              <button
                className={"tgl" + (org.publicProfileEnabled ? " on" : "")}
                type="button"
                id="publicToggle"
                aria-label="Publish public profile"
              ></button>
            </div>
            <label className="cf cf-wide">
              <span className="cf-lbl">Hero title</span>
              <input
                className="cf-in"
                data-g="title"
                placeholder="Roofing and fencing done right, on schedule"
                defaultValue={org.landingHeroTitle}
              />
            </label>
            <label className="cf cf-wide">
              <span className="cf-lbl">Hero subtitle</span>
              <input
                className="cf-in"
                data-g="sub"
                placeholder="Serving Bothell, Kirkland and the east side since 2018"
                defaultValue={org.landingHeroSubtitle}
              />
            </label>
            <div className="save-line" id="saveLanding"></div>
          </div>
        </div>
      </section>

      <div className="pmenu" id="pMenu"></div>

      <CompanySprite />
    </>
  );
}
