"use client";

// SUBSCRIPTION — BLUEPRINT · the page.
// Route: /dashboard/subscription (promoted 2026-08-12; ported at
// /dashboard/subscription-blueprint, which no longer exists).
//
// A port of the approved mockup jobflex-subscription-blueprint (8).html, with
// one owner-directed revision (2026-08-17): the Free tier is removed from the
// product, so the plan-limit banner is gone and the fixture org reads as a
// Professional subscriber (see ./subscription-data.ts). Everything else is the
// source's string, unchanged.
//
// THE CHROME IS NOT PORTED. The mockup ships the whole app shell — a 24-link
// `aside.sb` with its sliding indicator and account footer, a `header.topbar`
// with search / burger / New Estimate / bell, and the `div.layout` >
// `div.main` frame around them. All of it is discarded: blueprint-shell
// already renders that furniture from src/app/dashboard/layout.tsx and
// re-porting it would fork the navigation. What ships is the children of
// `div.content` and nothing else, which is why this component returns a
// FRAGMENT: the six blocks are direct children of the shell's `.content`,
// so its `display: flex; flex-direction: column; gap: 22px` spaces them
// exactly as `.content` does in the source (the two rules are byte-identical).
//
// THE SIX BLOCKS, in source order (the source's second block, the `.banner`
// free-plan-limit upsell, left with the Free tier):
//   .page-head · .sub-hero · #plans (tier spectrum) ·
//   .row-ub (usage + billing) · Refer & earn · Compare all plans
//
// NO innerHTML. The source builds `.spec-cell`, `.us-row`, `.inv-row` and the
// whole comparison table by concatenating HTML strings and assigning
// `innerHTML`. Those are real JSX here, mapped over the fixtures in
// ./subscription-data.ts — same markup, same classes, same order, no
// dangerouslySetInnerHTML anywhere.
//
// STATE. Exactly one piece: the Copy button's label. Everything else that
// moves is imperative and lives in ./subscription-behavior.ts, mounted through
// the shell's `useBlueprintContent` layout-effect contract so the first paint
// is already primed.
//
// NO DATA LAYER, and on a billing surface that is a decision rather than an
// omission: no server action, no API route, no Prisma, no Stripe. Every figure
// is a fixture. Since the 2026-08-12 promotion this IS /dashboard/subscription;
// the data-wired predecessor is deleted (git history has it) and wiring live
// data into this skin is a separate, not-yet-assigned task.

import { useCallback, useEffect, useRef, useState } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initSubscriptionContent } from "./subscription-behavior";
import { SubscriptionSprite } from "./subscription-sprite";
import { FEATURES, INVOICES, PLANS, USAGE } from "./subscription-data";
import styles from "./subscription.module.css";

/**
 * Class list by the SOURCE's literal names, so the JSX below reads as the
 * mockup's markup does and the stylesheet stays diffable against it.
 *
 * The fallback matters: four class names in the source's markup — `sub-hero-l`,
 * `us-list`, `inv-list`, `ref-l` — have no rule anywhere in its stylesheet, so
 * the module exports nothing for them. They are emitted literally rather than
 * dropped, to keep the markup faithful; each was checked against the shell's
 * always-on modules first and none is claimed there, so they style nothing and
 * can collide with nothing.
 */
function cx(...names: Array<string | false | null | undefined>): string {
  return names
    .filter(Boolean)
    .map((n) => styles[n as string] ?? (n as string))
    .join(" ");
}

/** `rv` stays LITERAL: the entrance cascade is published once, globally, by the
 *  always-on dashboard module (`.bp :global(.rv)`), with the same values the
 *  source declares. Porting a second hashed copy would be two definitions of
 *  one thing. */
const RV = "rv";

export function SubscriptionContent() {
  const [copyLabel, setCopyLabel] = useState("Copy");
  const copyTimer = useRef(0);

  useBlueprintContent(initSubscriptionContent);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copyCode = useCallback(() => {
    const code = "JF-IVAN-7D2K";
    const done = () => {
      setCopyLabel("Copied");
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopyLabel("Copy"), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, done);
    } else {
      done();
    }
  }, []);

  /** The price cell shared by the tier spectrum and the comparison table.
   *
   *  `{"$" + mo}` rather than `${mo}`: adjacent JSX expressions become SEPARATE
   *  text nodes, and the browser shapes each one independently — measured, a
   *  split "$79" and a split "4 / 5" come out 1px wider than the single text
   *  node the source's innerHTML produces. One string, one text node, identical
   *  metrics. */
  const price = (mo: number | null) =>
    mo === null ? (
      <b>Custom</b>
    ) : (
      <>
        <b>{"$" + mo}</b>
        <i>/ mo</i>
      </>
    );

  return (
    <>
      {/* PAGE HEAD */}
      <div className={cx("page-head", RV)}>
        <div>
          <div className={cx("kicker")}>Account</div>
          <h1 className={cx("page-title")}>Subscription</h1>
        </div>
        <div className={cx("page-actions")}>
          <a className={cx("btn", "btn-primary")} href="#plans">
            <svg className={cx("ic")}>
              <use href="#i-arrow" />
            </svg>
            Upgrade plan
          </a>
        </div>
      </div>

      {/* CURRENT PLAN HERO */}
      <section className={cx("sub-hero", RV)}>
        <div className={cx("sub-hero-l")}>
          <div className={cx("sub-hero-meta")}>Your plan · Acct № 2847</div>
          <div className={cx("sub-hero-name")}>Professional</div>
          <div className={cx("sub-hero-row")}>
            <span className={cx("sub-hero-price")}>
              $79<i>/ mo</i>
            </span>
            <span className={cx("sub-hero-sep")}></span>
            <span className={cx("sub-hero-note")}>Billed monthly — cancel any time</span>
          </div>
        </div>
        <div className={cx("sub-hero-r")}>
          <div className={cx("sub-stamp-zone")}>
            <span className={cx("sub-stamp")}>Active</span>
          </div>
          <div className={cx("sub-hero-facts")}>
            <div>
              <span>Member since</span>
              <b>Mar 2026</b>
            </div>
            <div>
              <span>Seats</span>
              <b>1 of 3</b>
            </div>
            <div>
              <span>Next bill</span>
              <b>Aug 1, 2026</b>
            </div>
          </div>
        </div>
      </section>

      {/* TIER SPECTRUM */}
      <section className={cx("card", "card--flush", RV)} id="plans">
        <div className={cx("spec")} id="specGrid">
          {PLANS.map((p) => (
            <div key={p.slug} className={cx("spec-cell", p.cur && "is-cur")}>
              <div className={cx("spec-name")}>{p.name}</div>
              <div className={cx("spec-price")}>{price(p.mo)}</div>
              <div className={cx("spec-foot")}>
                {p.cur ? (
                  <span className={cx("spec-cur")}>Current plan</span>
                ) : (
                  <button className={cx("btn", p.hot ? "btn-primary" : "btn-ghost")} type="button">
                    {p.cta}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* USAGE + BILLING */}
      <div className={cx("row-ub", RV)}>
        <div className={cx("card")} id="usageCard">
          <div className={cx("card-head")}>
            <h2>Usage</h2>
            <a className={cx("btn", "btn-ghost")} href="#plans">
              Change plan
            </a>
          </div>
          <div className={cx("us-list")} id="usList">
            {USAGE.map((u) => {
              const pct = Math.min(100, (u.used / u.limit) * 100);
              const cls = pct >= 90 ? "hot" : pct >= 60 ? "warn" : "";
              return (
                <div key={u.label} className={cx("us-row")}>
                  <div className={cx("us-top")}>
                    <span className={cx("us-lbl")}>{u.label}</span>
                    <span className={cx("us-num")}>{u.used + " / " + u.limit}</span>
                  </div>
                  <div className={cx("us-bar")}>
                    {/* width is written by the behavior module from data-w,
                        never by React — see its "USAGE BARS" note. */}
                    <span className={cx("us-fill", cls)} data-w={pct.toFixed(1)}></span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={cx("us-note")}>
            Limits reset each billing cycle · hitting one never blocks existing work
          </div>
        </div>
        <div className={cx("card")} id="billCard">
          <div className={cx("card-head")}>
            <h2>Billing history</h2>
            <svg className={cx("ic", "card-head-ic")}>
              <use href="#i-file" />
            </svg>
          </div>
          <div className={cx("inv-head")}>
            <span>Invoice</span>
            <span>Date</span>
            <span>Status</span>
            <span className={cx("ta-r")}>Amount</span>
          </div>
          <div className={cx("inv-list")} id="invList">
            {INVOICES.map((v) => (
              <div key={v.no} className={cx("inv-row")}>
                <span className={cx("inv-no")}>{v.no}</span>
                <span className={cx("inv-date")}>{v.date}</span>
                <span>
                  <span className={cx("st-badge")}>{v.status}</span>
                </span>
                <span className={cx("inv-amt")}>{v.amt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* REFER & EARN */}
      <section className={cx("card", RV)}>
        <div className={cx("card-head")}>
          <h2>Refer &amp; earn</h2>
          <svg className={cx("ic", "card-head-ic")}>
            <use href="#i-gift" />
          </svg>
        </div>
        <div className={cx("ref-grid")}>
          <div className={cx("ref-l")}>
            <div className={cx("ref-code-row")}>
              <span className={cx("ref-code")} id="refCode">
                JF-IVAN-7D2K
              </span>
              <button
                className={cx("btn", "btn-ghost")}
                type="button"
                id="refCopy"
                onClick={copyCode}
              >
                <svg className={cx("ic")}>
                  <use href="#i-copy" />
                </svg>
                <span id="refCopyLbl">{copyLabel}</span>
              </button>
            </div>
            <div className={cx("ref-reward")}>
              Give a month, get a month — when they subscribe to any paid plan.
            </div>
            <div className={cx("ref-url")}>
              jobflex.com/r/<b>IVAN-7D2K</b>
            </div>
          </div>
          <div className={cx("kpi-grid", "kpi-grid--3")}>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Code uses</div>
              <div className={cx("kpi-val")}>12</div>
            </div>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Converted</div>
              <div className={cx("kpi-val")}>4</div>
            </div>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Pending</div>
              <div className={cx("kpi-val")}>2</div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARE ALL PLANS */}
      <section className={cx("card", "card--flush", RV)} id="compare">
        <div className={cx("mx-wrap")}>
          <table className={cx("mx")} id="mxTable">
            <thead>
              <tr>
                <th></th>
                {PLANS.map((p) => (
                  <th key={p.slug} className={p.cur ? cx("col-cur") : ""}>
                    <div className={cx("mx-plan")}>{p.name}</div>
                    <div className={cx("mx-price")}>{price(p.mo)}</div>
                    {p.cur ? <div className={cx("mx-cur")}>Current</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f[0]}>
                  <th className={cx("mx-feature")}>{f[0]}</th>
                  {PLANS.map((p, i) => (
                    <td key={p.slug} className={p.cur ? cx("col-cur") : ""}>
                      {p.slug === "custom" ? (
                        <span className={cx("mx-opt")}></span>
                      ) : i >= f[1] ? (
                        <span className={cx("mx-yes")}>✓</span>
                      ) : (
                        <span className={cx("mx-no")}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={cx("mx-foot")}>
          <span className={cx("mx-opt")}></span>Build your plan — pick exactly the features you need
        </div>
      </section>

      {/* Out of flow, so it is not a flex item and adds no gap. Last, so it
          cannot shift the reveal cascade's stagger indices. */}
      <SubscriptionSprite />

      {/* The source's second <style> block, verbatim. Without JS the reveal
          cascade never runs, and the `rv` class the markup carries would leave
          every block parked at opacity 0 — this is the escape hatch that keeps
          the page readable. suppressHydrationWarning because the HTML parser
          hands a scripting-enabled browser the noscript's contents as raw text,
          which never matches the element React expects; the markup React ships
          is correct either way. */}
      <noscript suppressHydrationWarning>
        <style>{`.rv{opacity:1!important;transform:none!important}`}</style>
      </noscript>
    </>
  );
}
