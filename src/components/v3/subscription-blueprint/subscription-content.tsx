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
// LIVE DATA since 2026-08-31: the page hands this component the SAME loader
// result the handheld half has run on all along (loadSubscriptionData — plan
// catalog, current plan, limits-engine usage, Stripe invoices, referral), so
// the two halves finally agree on every number. The fixtures in
// ./subscription-data.ts are no longer imported here; they remain only as the
// donor record. The plan CTAs lead to /dashboard/upgrade, the real checkout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";
import { initSubscriptionContent } from "./subscription-behavior";
import { SubscriptionSprite } from "./subscription-sprite";
// Type-only: erased at compile, so the loader's server imports never reach
// this client bundle.
import type { SubscriptionViewProps } from "@/app/(dashboard)/dashboard/subscription/subscription-load";
import { expandPlanFeatures } from "@/lib/planCatalog";
import styles from "./subscription.module.css";

const UPGRADE = "/dashboard/upgrade" as Route;

/** Epoch seconds → the fixture's date voice ("Jul 1, 2026"). */
function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

export function SubscriptionContent(props: SubscriptionViewProps) {
  const [copyLabel, setCopyLabel] = useState("Copy");
  const copyTimer = useRef(0);

  useBlueprintContent(initSubscriptionContent);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  /* The catalog, in the fixture's column shape: paid plans in display order
     plus the "Build your plan" custom column the mockup ends on. The custom
     column is CURRENT when the org's Subscription.plan says so. */
  const plansStrip = useMemo(() => {
    const paid = props.plans.filter((p) => !p.isFree);
    return [
      ...paid.map((p) => ({
        slug: p.slug,
        name: p.name,
        mo: Math.round(p.priceCents / 100) as number | null,
        cur: p.slug === props.currentSlug,
        features: p.features,
      })),
      {
        slug: "custom",
        name: "Build your plan",
        mo: null as number | null,
        cur: props.currentSlug === "custom",
        features: [] as string[],
      },
    ];
  }, [props.plans, props.currentSlug]);

  /* The comparison rows, "Everything in <plan>" expanded — the same rule the
     signup step and /dashboard/upgrade apply (lib/planCatalog). */
  const { rows: featureRows, included } = useMemo(
    () => expandPlanFeatures(props.plans.filter((p) => !p.isFree)),
    [props.plans],
  );

  const statusLabel = props.status
    ? props.status.charAt(0).toUpperCase() + props.status.slice(1)
    : "—";

  const copyCode = useCallback(() => {
    const code = props.referral.code;
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
  }, [props.referral.code]);

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
          <Link className={cx("btn", "btn-primary")} href={UPGRADE}>
            <svg className={cx("ic")}>
              <use href="#i-arrow" />
            </svg>
            Upgrade plan
          </Link>
        </div>
      </div>

      {/* CURRENT PLAN HERO */}
      <section className={cx("sub-hero", RV)}>
        <div className={cx("sub-hero-l")}>
          <div className={cx("sub-hero-meta")}>Your plan</div>
          <div className={cx("sub-hero-name")}>{props.planName}</div>
          <div className={cx("sub-hero-row")}>
            <span className={cx("sub-hero-price")}>
              {props.priceCents === null ? (
                "—"
              ) : (
                <>
                  {"$" + Math.round(props.priceCents / 100)}
                  <i>/ mo</i>
                </>
              )}
            </span>
            <span className={cx("sub-hero-sep")}></span>
            <span className={cx("sub-hero-note")}>Billed monthly — cancel any time</span>
          </div>
        </div>
        <div className={cx("sub-hero-r")}>
          <div className={cx("sub-stamp-zone")}>
            <span className={cx("sub-stamp")}>{statusLabel}</span>
          </div>
          <div className={cx("sub-hero-facts")}>
            <div>
              <span>Status</span>
              <b>{statusLabel}</b>
            </div>
            <div>
              <span>Trial ends</span>
              <b>{props.trialEndsAt ?? "—"}</b>
            </div>
            <div>
              <span>Next bill</span>
              <b>{props.nextBill ?? "—"}</b>
            </div>
          </div>
        </div>
      </section>

      {/* TIER SPECTRUM */}
      <section className={cx("card", "card--flush", RV)} id="plans">
        <div className={cx("spec")} id="specGrid">
          {plansStrip.map((p) => (
            <div key={p.slug} className={cx("spec-cell", p.cur && "is-cur")}>
              <div className={cx("spec-name")}>{p.name}</div>
              <div className={cx("spec-price")}>{price(p.mo)}</div>
              <div className={cx("spec-foot")}>
                {p.cur ? (
                  <span className={cx("spec-cur")}>Current plan</span>
                ) : (
                  <Link
                    className={cx("btn", p.slug === "custom" ? "btn-ghost" : "btn-primary")}
                    href={UPGRADE}
                  >
                    {p.slug === "custom" ? "Get started" : "Upgrade"}
                  </Link>
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
            {props.usage.length === 0 ? (
              <div className={cx("us-note")}>No metered limits on this plan.</div>
            ) : null}
            {props.usage.map((u) => {
              const pct = u.limit > 0 ? Math.min(100, (u.used / u.limit) * 100) : 0;
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
            {!props.invoices.available || props.invoices.invoices.length === 0 ? (
              <div className={cx("us-note")}>No invoices yet.</div>
            ) : null}
            {props.invoices.invoices.map((v) => (
              <div key={v.id} className={cx("inv-row")}>
                <span className={cx("inv-no")}>
                  {v.hostedInvoiceUrl ? (
                    <a href={v.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                      {v.number ?? v.id.slice(0, 12)}
                    </a>
                  ) : (
                    (v.number ?? v.id.slice(0, 12))
                  )}
                </span>
                <span className={cx("inv-date")}>{fmtDate(v.created)}</span>
                <span>
                  <span className={cx("st-badge")}>{v.status ?? "—"}</span>
                </span>
                <span className={cx("inv-amt")}>{"$" + (v.amountPaidCents / 100).toFixed(2)}</span>
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
                {props.referral.code}
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
            <div className={cx("ref-reward")}>{props.referral.rewardSummary}</div>
            <div className={cx("ref-url")}>
              {props.referral.shareUrl.replace(/^https?:[/][/]/, "")}
            </div>
          </div>
          <div className={cx("kpi-grid", "kpi-grid--3")}>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Code uses</div>
              <div className={cx("kpi-val")}>{props.referral.uses}</div>
            </div>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Converted</div>
              <div className={cx("kpi-val")}>{props.referral.converted}</div>
            </div>
            <div className={cx("kpi")}>
              <div className={cx("kpi-lbl")}>Pending</div>
              <div className={cx("kpi-val")}>{props.referral.pending}</div>
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
                {plansStrip.map((p) => (
                  <th key={p.slug} className={p.cur ? cx("col-cur") : ""}>
                    <div className={cx("mx-plan")}>{p.name}</div>
                    <div className={cx("mx-price")}>{price(p.mo)}</div>
                    {p.cur ? <div className={cx("mx-cur")}>Current</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((f) => (
                <tr key={f}>
                  <th className={cx("mx-feature")}>{f}</th>
                  {plansStrip.map((p) => (
                    <td key={p.slug} className={p.cur ? cx("col-cur") : ""}>
                      {p.slug === "custom" ? (
                        <span className={cx("mx-opt")}></span>
                      ) : included.get(p.slug)?.has(f.toLowerCase()) ? (
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
