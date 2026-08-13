"use client";

// MOBILE SUBSCRIPTION — Blueprint system, handheld build (320–768px).
//
// ONE implementation, TWO entry points:
//   · /mobile-subscription-v2                — the direct preview route
//   · /dashboard/subscription at ≤768px      — the live URL, through the
//     media-query switch in ./subscription-responsive.tsx
// Both are server components that run the SAME fetch and the SAME owner-only
// guard and hand the result down as props, so the two cannot drift and the
// data never moves to the client.
//
// WHAT THIS IS A MERGE OF
//   · DESIGN comes from components/v3/subscription-blueprint (the approved
//     mockup port): the ink hero with its drawing grid and rotated status
//     stamp, the tier treatment, the usage meters, the invoice ledger, the
//     refer & earn block, the 3-cell KPI strip, Motion System "Balanced".
//   · DATA and BEHAVIOUR come from the live (dashboard)/dashboard/subscription
//     view: the admin-managed plan catalog, the limits engine's enforced caps,
//     real Stripe invoices, the org's referral code, and the real checkout
//     (usePlanCheckout → /api/checkout/subscription, or setOrgPlan for a free
//     plan). Where the mockup's control wrote nothing and the live control does
//     something real, the live behaviour wins. NOTHING here is a fixture.
//
// FIGURES THE MOCKUP SHOWS THAT THE LIVE DATA CANNOT SUPPLY are OMITTED, not
// invented — on a billing surface a fabricated number is the worst possible
// defect. Dropped, with the reason:
//   · "Acct № 2847"          — no account-number field exists.
//   · "Member since Mar 2026"— not read by this page's queries.
//   · "Seats 1 of 1"         — the limits engine exposes teamSeats/workers as
//                              usage rows, which is where they render instead.
//   · the 11-row feature MATRIX with per-tier columns — the catalog stores a
//     flat `features: string[]` per plan, not a feature × tier grid, so each
//     plan card lists its own real features (see "PLAN COMPARISON" below).
//   · "Build your plan" / "Custom" tier — not a row in /admin/plans.
//
// THE THREE HANDHELD PROBLEMS, and how they are solved:
//
// 1. PLAN COMPARISON. A multi-column pricing table is unreadable at 320px.
//    CHOSEN: full-width stacked plan cards, the org's current plan pinned
//    first, each card carrying its own real feature list, so comparison is
//    reading two adjacent cards rather than tracking a row across columns.
//    Every plan stays on the page — nothing is behind a gesture.
//    REJECTED: (a) a horizontally-snapping card rail — it hides plans
//    off-screen and turns "is Professional worth $50 more" into a
//    remember-and-swipe task; (b) a segmented tier switcher — same defect,
//    plus the switcher itself cannot hold five labels at 320px; (c) the
//    desktop feature matrix with a horizontal scroller — a 1000px-min table
//    panned sideways on a phone is exactly the surface the mobile rule exists
//    to prevent.
//
// 2. THE INVOICE TABLE. Four columns (number / date / status / amount) plus a
//    link cannot hold 320px. CHOSEN: each invoice becomes a two-line row —
//    number + status badge above, date + amount below — and the WHOLE row is
//    the anchor to Stripe's hosted invoice or PDF when one exists, at 64px
//    tall. Nothing is dropped: the link, the status tone and the amount all
//    survive. REJECTED: an overflow-x table (loses the tap affordance and
//    makes the amount the thing you have to pan to see) and hiding the
//    status column (it is the one column that changes what you do next).
//
// 3. USAGE METERS. The limits engine returns up to fifteen caps. CHOSEN: keep
//    every finite cap, keep the mono tabular `used / limit`, and sort by
//    PRESSURE (percentage used, descending; ties fall back to the engine's own
//    order) so the cap about to stop you is the one at the top of the card
//    rather than the one alphabetically first. The desktop's static order is a
//    deliberate change, noted here because it is the one place this build
//    reorders live data.
//
// Light mode only, no .dark, no Radix — the change-plan sheet is hand-rolled
// in the house style, with the shared swipe-to-dismiss hook.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import { lockScroll } from "@/lib/scrollLock";
import { money, longDate } from "@/lib/format";
import {
  formatPlanPrice,
  priceCadence,
  planCtaLabel,
  featureTierForSlug,
  type PlanDTO,
} from "@/lib/planCatalog";
import {
  ALL_FEATURES,
  FEATURE_LABELS,
  PLAN_TIERS,
  hasFeature,
  type Feature,
} from "@/lib/entitlements";
import { LIMIT_DEFS, type LimitKey } from "@/lib/planLimits";
import { usePlanCheckout } from "@/components/billing/usePlanCheckout";
import type { SubscriptionInvoice } from "@/actions/billing";
import "./mobile-subscription.css";

/** One enforced-limit row from the limits engine (finite caps only). */
export interface MobileUsageRow {
  resource: string;
  label: string;
  used: number;
  limit: number;
}

export interface MobileSubscriptionProps {
  /** Display name of the current plan (catalog name, or title-cased orphan slug). */
  planName: string;
  /** Monthly price of the current plan; null when the slug left the catalog. */
  priceCents: number | null;
  isFree: boolean;
  /** Lowercase slug used to mark "current" among the plan cards. */
  currentSlug: string;
  /** Active catalog plans, display-ordered — /admin/plans is the only source. */
  plans: PlanDTO[];
  status: string;
  nextBill: string | null;
  trialEndsAt: string | null;
  usage: MobileUsageRow[];
  invoices: { available: boolean; invoices: SubscriptionInvoice[] };
  referral: {
    code: string;
    shareUrl: string;
    rewardSummary: string;
    uses: number;
    converted: number;
    pending: number;
  };
}

const PROBLEM_STATUSES = ["PAST_DUE", "CANCELED", "EXPIRED"];
/** A cap at or past this share of its limit raises the banner. */
const PRESSURE_ALERT = 90;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fire-and-forget: the clipboard is unavailable in insecure contexts and in
 *  some in-app browsers. The confirmation state is driven by the tap either
 *  way, exactly as the live view's copy control is. */
function copyText(text: string) {
  if (typeof navigator === "undefined") return;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function Icon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? "jfms-ic"} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** Same mapping the live view uses for a Stripe invoice status. */
function invoiceBadge(s: string | null): string {
  switch (s) {
    case "paid":
      return "jfms-ok";
    case "open":
      return "jfms-warn";
    case "void":
    case "uncollectible":
      return "jfms-bad";
    default:
      return "";
  }
}

function stampTone(status: string): string {
  if (status === "ACTIVE") return "jfms-stOk";
  if (status === "TRIALING") return "jfms-stWarn";
  if (PROBLEM_STATUSES.includes(status)) return "jfms-stBad";
  return "jfms-stNeutral";
}

/** The features a plan turns on. Same source the desktop comparison matrix
 *  uses — ALL_FEATURES gated by MINIMUM_PLAN_FOR through the plan's slug — so
 *  the two surfaces can never disagree, and nothing here is authored copy. */
function includedFeatures(slug: string): Feature[] {
  const tier = featureTierForSlug(slug);
  return ALL_FEATURES.filter((f) => hasFeature(tier, f));
}

/**
 * The stacked-card answer to a comparison matrix: each plan says what it adds
 * to the plan one tier below it ("Everything in Starter, plus …"), so two
 * adjacent cards read as a comparison instead of a repetition.
 *
 * The base is chosen by TIER RANK, not by catalog display order, because the
 * gating is rank-monotonic and only a rank-lower plan is guaranteed to be a
 * subset. When no lower plan exists, or it turns nothing on, the card lists its
 * own features in full and claims no inheritance.
 */
function planFeatureBlocks(plans: PlanDTO[]) {
  const rank = (slug: string) => PLAN_TIERS.indexOf(featureTierForSlug(slug));
  const byRank = [...plans].sort((a, b) => rank(a.slug) - rank(b.slug));
  const out = new Map<string, { inherits: string | null; features: Feature[] }>();
  plans.forEach((p) => {
    const mine = includedFeatures(p.slug);
    const lower = byRank.filter((q) => rank(q.slug) < rank(p.slug));
    const base = lower.length ? lower[lower.length - 1] : null;
    const baseFeatures = base ? includedFeatures(base.slug) : [];
    if (base && baseFeatures.length > 0 && baseFeatures.every((f) => mine.includes(f))) {
      out.set(p.slug, {
        inherits: base.name,
        features: mine.filter((f) => !baseFeatures.includes(f)),
      });
    } else {
      out.set(p.slug, { inherits: null, features: mine });
    }
  });
  return out;
}

/** The plan's own enforced caps, off PricingPlan.limitsJson. Keys with no
 *  entry are unlimited and simply do not appear — the same rule the limits
 *  engine applies, so a cap shown here is a cap that actually enforces. */
function planCaps(p: PlanDTO): Array<{ key: string; label: string; value: number }> {
  return LIMIT_DEFS.filter((d) => typeof p.limits[d.key as LimitKey] === "number").map((d) => ({
    key: d.key,
    label: d.label,
    value: p.limits[d.key as LimitKey] as number,
  }));
}

/** Tier tone, positional exactly as the live view's is: free plans take the
 *  neutral graphite, paid plans cycle by catalog order. See the CSS note on
 *  why the cycle is blueprint → sky → deep blueprint and not a status hue. */
function toneClass(plans: PlanDTO[], slug: string): string {
  const paid = plans.filter((p) => !p.isFree);
  const idx = paid.findIndex((p) => p.slug === slug);
  if (idx < 0) return "jfms-toneFree";
  return ["jfms-toneA", "jfms-toneB", "jfms-toneC"][idx % 3];
}

export function MobileSubscription({
  planName,
  priceCents,
  isFree,
  currentSlug,
  plans,
  status,
  nextBill,
  trialEndsAt,
  usage,
  invoices,
  referral,
}: MobileSubscriptionProps) {
  const { start, pendingSlug } = usePlanCheckout();

  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const plansRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const copyTimer = useRef(0);
  const [bannerOpen, setBannerOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState(currentSlug);
  const [interval, setIntervalChoice] = useState<"MONTH" | "YEAR">("MONTH");

  const sheetDrag = useSheetDrag(sheetOpen, () => setSheetOpen(false));

  /* ---------- Derived, all from the server props ---------------------- */

  const isTrial = status === "TRIALING";

  // Pressure order. `slice()` first: the prop array is the server's and must
  // not be sorted in place.
  const usageSorted = useMemo(() => {
    return usage
      .map((u, i) => ({ ...u, i, pct: Math.min(100, (u.used / Math.max(1, u.limit)) * 100) }))
      .sort((a, b) => b.pct - a.pct || a.i - b.i);
  }, [usage]);

  const tightest = usageSorted[0];
  const showBanner = bannerOpen && !!tightest && tightest.pct >= PRESSURE_ALERT;

  // Current plan first, then the catalog's own display order. A slug that has
  // left the catalog simply has no card — the hero still names it.
  const planCards = useMemo(() => {
    const cur = plans.filter((p) => p.slug === currentSlug);
    const rest = plans.filter((p) => p.slug !== currentSlug);
    return [...cur, ...rest];
  }, [plans, currentSlug]);

  const featureBlocks = useMemo(() => planFeatureBlocks(plans), [plans]);

  const selected = plans.find((p) => p.slug === target) ?? null;
  const yearlyAvailable = !!selected?.yearlyPriceCents;
  const busy = pendingSlug !== null;

  const shareHost = referral.shareUrl.replace(/^https?:\/\//, "");

  /* ---------- Interactions -------------------------------------------- */

  const flash = useCallback((what: "code" | "url") => {
    setCopied(what);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
  }, []);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const goToPlans = useCallback(() => {
    plansRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const openSheet = useCallback(() => {
    setTarget(plans.some((p) => p.slug === currentSlug) ? currentSlug : (plans[0]?.slug ?? ""));
    setIntervalChoice("MONTH");
    setSheetOpen(true);
  }, [plans, currentSlug]);

  // The shared reference-counted lock — never a hand-rolled body.style.overflow,
  // which poisons every other lock on the page.
  useEffect(() => {
    if (!sheetOpen) return;
    const release = lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      release();
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  /** The sheet's confirm. Same call the live change-plan dialog makes, with
   *  the same interval argument — a free plan switches directly, a paid plan
   *  goes to Stripe Checkout. */
  const applyTarget = useCallback(async () => {
    if (!selected) return;
    await start(selected, yearlyAvailable ? interval : "MONTH");
    if (selected.isFree) setSheetOpen(false); // the paid path navigates away
  }, [selected, start, yearlyAvailable, interval]);

  /* ---------- Motion: usage bars draw to their real value -------------- */
  // Width is written here rather than in JSX so the bars animate from 0 on
  // first paint (the design's authored intent) and the markup stays free of
  // inline styles.
  useEffect(() => {
    const host = contentRef.current;
    if (!host) return;
    const bars = host.querySelectorAll<HTMLElement>("[data-w]");
    const paint = () => bars.forEach((b) => b.style.setProperty("--w", `${b.dataset.w}%`));
    if (prefersReducedMotion()) {
      paint();
      return;
    }
    const raf = requestAnimationFrame(() => requestAnimationFrame(paint));
    return () => cancelAnimationFrame(raf);
  }, [usageSorted]);

  /* ---------- Motion: reveal on load + adaptive reveal on scroll ------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    let velLastY = host.scrollTop;
    let velLastT = performance.now();
    let vel = 0;
    const onScroll = () => {
      const now = performance.now();
      vel = Math.abs(host.scrollTop - velLastY) / Math.max(1, now - velLastT);
      velLastY = host.scrollTop;
      velLastT = now;
    };
    host.addEventListener("scroll", onScroll, { passive: true });

    const vpH = window.innerHeight;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("jfms-rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? `${i * 60}ms` : "200ms";
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          // Below the fold the duration follows scroll speed — slow ≈ 900ms,
          // fast never shorter than 550ms.
          if (t.dataset.rvScroll) {
            t.style.transitionDuration = `${Math.round(Math.max(550, 900 - vel * 160))}ms`;
          }
          t.classList.add("jfms-rvIn");
          io.unobserve(t);
          const done = () => {
            t.style.transitionDelay = "";
            t.style.transitionDuration = "";
            t.removeEventListener("transitionend", done);
          };
          t.addEventListener("transitionend", done);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      host.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- Motion: graph-paper parallax ----------------------------- */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = scrollRef.current;
    if (!host) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        host.style.setProperty("--gy", `${(-(host.scrollTop * 0.06)).toFixed(1)}px`);
        ticking = false;
      });
    };
    host.addEventListener("scroll", onScroll, { passive: true });
    return () => host.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Motion: press stamp (delegated) --------------------------- */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("button, a");
    if (!el) return;
    el.classList.remove("jfms-pressed");
    void el.offsetWidth;
    el.classList.add("jfms-pressed");
    window.setTimeout(() => el.classList.remove("jfms-pressed"), 200);
  }, []);

  /* ---------- Render ---------------------------------------------------- */

  const billLabel = isTrial ? "Trial ends" : "Next bill";
  const billValue = isTrial
    ? trialEndsAt
      ? longDate(trialEndsAt)
      : "On trial"
    : nextBill
      ? longDate(nextBill)
      : "—";

  return (
    <div className="jf-mobile-subscription" onClick={onRootClick}>
      {/* Shared handheld chrome: dark topbar, drawer with the full nav map,
          and the icon sprite every <use href="#i-…"> below resolves against.
          Owns its own open state, so this page holds none. */}
      <MobileNav />

      <main className="jfms-scroll" ref={scrollRef}>
        <div className="jfms-content" ref={contentRef}>
          {/* ============ PAGE HEAD ============ */}
          <div className="jfms-pageHead">
            <div className="jfms-kicker">Account</div>
            <h1 className="jfms-pageTitle">Subscription</h1>
            <p className="jfms-pageSub">Your plan, what it bills, and what it has cost.</p>
          </div>

          {/* ============ PLAN LIMIT BANNER ============
              Raised only by a real cap at ≥90%, and it names that cap. */}
          {showBanner && tightest ? (
            <div className="jfms-banner">
              <Icon id="i-bulb" className="jfms-ic jfms-bannerPin" />
              <div className="jfms-bannerBody">
                <div className="jfms-bannerKicker">Plan limit</div>
                <div className="jfms-bannerTxt">
                  {`${tightest.label}: ${tightest.used.toLocaleString()} of ${tightest.limit.toLocaleString()} used this cycle.`}
                </div>
                <button type="button" className="jfms-bannerCta" onClick={goToPlans}>
                  See plans
                </button>
              </div>
              <button
                type="button"
                className="jfms-bannerClose"
                aria-label="Dismiss plan limit notice"
                onClick={() => setBannerOpen(false)}
              >
                <Icon id="i-x" />
              </button>
            </div>
          ) : null}

          {/* ============ CURRENT PLAN HERO ============ */}
          <section className={`jfms-hero ${toneClass(plans, currentSlug)}`} aria-label="Current plan">
            <span className="jfms-heroEdge" aria-hidden="true" />
            <div className="jfms-heroTop">
              {/* The status stamp rides the TOP-RIGHT corner (owner's call,
                  2026-08-12), paired with the "Your plan" kicker rather than
                  hanging under the price. In the head row, not absolutely
                  positioned: a long status ("PAST DUE") over a long plan name
                  would collide, and here the row simply lays them out. */}
              <div className="jfms-heroHead">
                <div className="jfms-heroMeta">Your plan</div>
                <div className={`jfms-stamp ${stampTone(status)}`}>
                  {status.replace(/_/g, " ").toLowerCase()}
                </div>
              </div>
              <h2 className="jfms-heroName">{planName}</h2>
              <div className="jfms-heroRow">
                <span className="jfms-heroPrice">
                  {priceCents !== null ? formatPlanPrice(priceCents) : "—"}
                  {priceCents !== null ? <i>{priceCadence(isFree, true)}</i> : null}
                </span>
              </div>
            </div>
            <div className="jfms-heroFacts">
              <div className="jfms-heroFact">
                <span className="jfms-heroFactL">{billLabel}</span>
                <span className="jfms-heroFactV">{billValue}</span>
              </div>
              <div className="jfms-heroFact">
                <span className="jfms-heroFactL">Billing</span>
                <span className="jfms-heroFactV">
                  {priceCents === null ? "—" : isFree ? "Free forever" : "Per month"}
                </span>
              </div>
            </div>
          </section>

          {/* ============ USAGE ============ */}
          <section className="jfms-card" aria-labelledby="jfmsUsageT">
            <div className="jfms-cardHead">
              <h2 className="jfms-cardTitle" id="jfmsUsageT">
                Usage
              </h2>
              <button type="button" className="jfms-btn jfms-btnSm" onClick={openSheet}>
                Change plan
              </button>
            </div>
            <div className="jfms-cardBody">
              {usageSorted.length === 0 ? (
                <div className="jfms-empty">
                  <Icon id="i-check" className="jfms-ic jfms-emptyIc" />
                  <div className="jfms-emptyT">No caps on this plan</div>
                  <div className="jfms-emptyS">Everything on your plan is unlimited.</div>
                </div>
              ) : (
                usageSorted.map((u) => {
                  const tone = u.pct >= 90 ? "jfms-hot" : u.pct >= 60 ? "jfms-warn" : "";
                  return (
                    <div key={u.resource} className={`jfms-usRow ${tone}`}>
                      <div className="jfms-usTop">
                        <span className="jfms-usLbl">{u.label}</span>
                        <span className="jfms-usNum">
                          {`${u.used.toLocaleString()} / ${u.limit.toLocaleString()}`}
                        </span>
                      </div>
                      <div className="jfms-usBar">
                        <span
                          className={`jfms-usFill ${tone}`}
                          data-w={u.pct.toFixed(1)}
                          role="progressbar"
                          aria-label={u.label}
                          aria-valuenow={u.used}
                          aria-valuemin={0}
                          aria-valuemax={u.limit}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="jfms-cardFoot">
              Limits reset each billing cycle · hitting one never blocks existing work
            </div>
          </section>

          {/* ============ PLANS ============ */}
          {/* Just the word (owner's call, 2026-08-12): the drawn rule and the
              "N available" tally were mono annotation on a heading that is
              already the loudest break on the page. Set as a real headline
              rather than a mono kicker. */}
          <div className="jfms-sectionLbl" ref={plansRef}>
            Plans
          </div>

          <div className="jfms-plans">
            {planCards.map((p) => {
              const current = p.slug === currentSlug;
              const block = featureBlocks.get(p.slug);
              const caps = planCaps(p);
              return (
                <article
                  key={p.slug}
                  className={`jfms-plan ${toneClass(plans, p.slug)} ${current ? "jfms-isCur" : ""}`}
                >
                  <div className="jfms-planTop">
                    <div className="jfms-planHeadRow">
                      <div className="jfms-planName">{p.name}</div>
                      {/* The free marker is a CORNER badge (owner's call,
                          2026-08-12), not the "forever" annotation that used to
                          hang under the $0. It says the same thing in the place
                          the eye already checks for a card's label, and it stops
                          the free card's price block from reading two lines deep
                          while every paid card reads one. */}
                      {p.isFree ? <span className="jfms-planFree">Free</span> : null}
                      {p.highlight && !current ? (
                        <span className="jfms-planFlag">Most popular</span>
                      ) : null}
                    </div>
                    <div className="jfms-planPrice">
                      <b>{formatPlanPrice(p.priceCents)}</b>
                      {p.isFree ? null : <i>{priceCadence(p.isFree, true)}</i>}
                    </div>
                    {p.description ? <p className="jfms-planDesc">{p.description}</p> : null}
                    {caps.length > 0 ? (
                      <div className="jfms-planCaps">
                        {caps.map((c) => (
                          <div key={c.key} className="jfms-planCap">
                            <span>{c.label}</span>
                            <span className="jfms-planCapV">{c.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {block?.inherits ? (
                      <div className="jfms-planInherit">
                        {block.features.length > 0
                          ? `Everything in ${block.inherits}, plus`
                          : `Everything in ${block.inherits}`}
                      </div>
                    ) : null}
                    {block && block.features.length > 0 ? (
                      <ul className="jfms-planFeat">
                        {block.features.map((f) => (
                          <li key={f}>
                            <span className="jfms-featTick" aria-hidden="true">
                              ✓
                            </span>
                            <span>{FEATURE_LABELS[f]}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="jfms-planFoot">
                    {!current && !p.isFree && p.trialDays > 0 ? (
                      <div className="jfms-planTrial">{p.trialDays}-day free trial</div>
                    ) : null}
                    {current ? (
                      <div className="jfms-planCur">
                        <Icon id="i-check" />
                        Current plan
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`jfms-btn ${p.highlight ? "jfms-btnPrimary" : ""}`}
                        disabled={busy}
                        onClick={() => start(p)}
                      >
                        {pendingSlug === p.slug ? "Working…" : planCtaLabel(p.isFree, p.trialDays)}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* ============ BILLING HISTORY ============ */}
          <section className="jfms-card" aria-labelledby="jfmsBillT">
            <div className="jfms-cardHead">
              <h2 className="jfms-cardTitle" id="jfmsBillT">
                Billing history
              </h2>
              <Icon id="i-file" className="jfms-ic jfms-cardHeadIc" />
            </div>
            <div className="jfms-cardBody">
              <InvoiceRows data={invoices} />
            </div>
          </section>

          {/* ============ REFER & EARN ============ */}
          <section className="jfms-card" aria-labelledby="jfmsRefT">
            <div className="jfms-cardHead">
              <h2 className="jfms-cardTitle" id="jfmsRefT">
                Refer &amp; earn
              </h2>
              <Icon id="i-gift" className="jfms-ic jfms-cardHeadIc" />
            </div>
            <div className="jfms-cardBody">
              <div className="jfms-refRow">
                <button
                  type="button"
                  className="jfms-refCode"
                  onClick={() => {
                    copyText(referral.code);
                    flash("code");
                  }}
                >
                  {referral.code}
                </button>
                <button
                  type="button"
                  className={`jfms-refCopy ${copied === "code" ? "jfms-isDone" : ""}`}
                  aria-label="Copy referral code"
                  onClick={() => {
                    copyText(referral.code);
                    flash("code");
                  }}
                >
                  <Icon id={copied === "code" ? "i-check" : "i-copy"} />
                </button>
              </div>
              <p className="jfms-refReward">{referral.rewardSummary}</p>
              <button
                type="button"
                className="jfms-refUrl"
                onClick={() => {
                  copyText(referral.shareUrl);
                  flash("url");
                }}
              >
                <span className="jfms-refUrlTxt">{shareHost}</span>
                <span
                  className={`jfms-flag ${copied === "url" ? "jfms-isOn" : ""}`}
                  role="status"
                >
                  {copied === "url" ? "Copied" : ""}
                </span>
              </button>
            </div>
            <div className="jfms-kpiGrid">
              <div className="jfms-kpi">
                <div className="jfms-kpiLbl">Code uses</div>
                <div className="jfms-kpiVal">{referral.uses}</div>
              </div>
              <div className="jfms-kpi">
                <div className="jfms-kpiLbl">Converted</div>
                <div className="jfms-kpiVal">{referral.converted}</div>
              </div>
              <div className="jfms-kpi">
                <div className="jfms-kpiLbl">Pending</div>
                <div className="jfms-kpiVal">{referral.pending}</div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ============ CHANGE-PLAN SHEET ============
          The live view's change-plan dialog, re-laid-out as a bottom sheet.
          It keeps the one thing the per-plan buttons cannot offer: the
          monthly / yearly interval, which is passed straight through to the
          same checkout call. */}
      <div
        className={`jfms-scrim ${sheetOpen ? "jfms-on" : ""}`}
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
      />
      <div
        className={`jfms-sheet ${sheetOpen ? "jfms-on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jfmsSheetT"
        aria-hidden={!sheetOpen}
        {...sheetDrag.sheetProps}
      >
        <div className="jfms-sheetGrab" {...sheetDrag.handleProps} />
        <div className="jfms-sheetHead" {...sheetDrag.handleProps}>
          <div className="jfms-sheetKicker">Account / billing</div>
          <div className="jfms-sheetTitle" id="jfmsSheetT">
            Change plan
          </div>
        </div>
        <div className="jfms-sheetBody">
          {plans.map((p) => {
            const sel = p.slug === target;
            return (
              <button
                key={p.slug}
                type="button"
                className={`jfms-sheetOpt ${sel ? "jfms-isSel" : ""}`}
                onClick={() => setTarget(p.slug)}
                aria-pressed={sel}
              >
                <span className="jfms-optMark" aria-hidden="true">
                  <Icon id="i-check" />
                </span>
                <span className="jfms-optTxt">
                  <span className="jfms-optName">{p.name}</span>
                  <span className="jfms-optSub">
                    {p.slug === currentSlug
                      ? "Current plan"
                      : p.isFree
                        ? "Free forever"
                        : p.trialDays > 0
                          ? `${p.trialDays}-day trial`
                          : "Billed monthly"}
                  </span>
                </span>
                <span className="jfms-optPrice">{formatPlanPrice(p.priceCents)}</span>
              </button>
            );
          })}

          {selected && !selected.isFree && yearlyAvailable ? (
            <div className="jfms-seg" role="group" aria-label="Billing period">
              <button
                type="button"
                className={`jfms-segBtn ${interval === "MONTH" ? "jfms-isSel" : ""}`}
                aria-pressed={interval === "MONTH"}
                onClick={() => setIntervalChoice("MONTH")}
              >
                {formatPlanPrice(selected.priceCents)} / mo
              </button>
              <button
                type="button"
                className={`jfms-segBtn ${interval === "YEAR" ? "jfms-isSel" : ""}`}
                aria-pressed={interval === "YEAR"}
                onClick={() => setIntervalChoice("YEAR")}
              >
                {formatPlanPrice(selected.yearlyPriceCents ?? 0)} / yr
              </button>
            </div>
          ) : null}

          <p className="jfms-sheetNote">
            {selected && !selected.isFree
              ? "Paid plans go through Stripe Checkout — you can apply a promo code there."
              : "Switching to a free plan takes effect immediately."}
          </p>
        </div>
        <div className="jfms-sheetFoot">
          <button
            type="button"
            className="jfms-btn"
            onClick={() => setSheetOpen(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="jfms-btn jfms-btnInk"
            onClick={applyTarget}
            disabled={busy || !selected || selected.slug === currentSlug}
          >
            {busy
              ? "Working…"
              : selected && selected.slug === currentSlug
                ? "Current plan"
                : selected
                  ? planCtaLabel(selected.isFree, selected.trialDays)
                  : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Invoice rows, with the live view's two honest empty states ───────── */
function InvoiceRows({ data }: { data: { available: boolean; invoices: SubscriptionInvoice[] } }) {
  if (!data.available) {
    return (
      <div className="jfms-empty">
        <Icon id="i-card" className="jfms-ic jfms-emptyIc" />
        <div className="jfms-emptyT">No billing history yet</div>
        <div className="jfms-emptyS">
          Invoices appear here once Stripe subscription billing is active for your account.
        </div>
      </div>
    );
  }
  if (data.invoices.length === 0) {
    return (
      <div className="jfms-empty">
        <Icon id="i-card" className="jfms-ic jfms-emptyIc" />
        <div className="jfms-emptyT">No invoices yet</div>
        <div className="jfms-emptyS">Your first invoice will show up here after it is issued.</div>
      </div>
    );
  }

  return (
    <div className="jfms-invList">
      {data.invoices.map((inv) => {
        const link = inv.hostedInvoiceUrl ?? inv.invoicePdf;
        const body = (
          <>
            <span className="jfms-invTop">
              <span className="jfms-invNo">{inv.number ?? "Invoice"}</span>
              <span className={`jfms-badge ${invoiceBadge(inv.status)}`}>{inv.status ?? "—"}</span>
              {link ? (
                <span className="jfms-invGo" aria-hidden="true">
                  <Icon id="i-arrow" />
                </span>
              ) : null}
            </span>
            <span className="jfms-invBot">
              <span className="jfms-invDate">{longDate(new Date(inv.created * 1000))}</span>
              <span className="jfms-invAmt">
                {money(inv.amountPaidCents / 100, inv.currency)}
              </span>
            </span>
          </>
        );
        return link ? (
          <a
            key={inv.id}
            className="jfms-invRow"
            href={link}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open invoice ${inv.number ?? ""}`.trim()}
          >
            {body}
          </a>
        ) : (
          <div key={inv.id} className="jfms-invRow">
            {body}
          </div>
        );
      })}
    </div>
  );
}
