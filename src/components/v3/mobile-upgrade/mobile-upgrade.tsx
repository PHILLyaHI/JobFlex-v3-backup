"use client";

// PLANS & UPGRADE · HANDHELD — the phone build of /dashboard/upgrade.
//
// Stands beside the desktop build (components/v3/upgrade-blueprint/*, which is
// untouched) and shares its whole data layer verbatim: the same catalog props
// the server page loads, the same `expandPlanFeatures` fold, the same
// /api/checkout/subscription POST and the same two server actions
// (billing.changePlan, billing.addCustomPages). Nothing here is a fixture and
// nothing here is a second endpoint — the props type is IMPORTED from the
// desktop module so the two surfaces cannot drift apart.
//
// WHAT CHANGES IS THE COMPOSITION, not the behaviour:
//   · The desktop's four side-by-side columns restack into one scrolling
//     column of full-width cards. A card is a decision, and on a phone a
//     decision gets the whole width.
//   · The feature list does not scroll inside a fixed-height card — it cannot,
//     at 390px. Three included rows are shown outright and the rest sit behind
//     a per-card "All N features" disclosure, so five cards stay scannable in
//     one thumb sweep and the detail is one tap away.
//   · The confirmation and the page picker are BOTTOM SHEETS, hand-rolled and
//     portalled to <body>. Portalled because this page renders inside the desk
//     shell's content column on /dashboard/upgrade, which is a stacking
//     context under the shared handheld topbar — a fixed overlay declared in
//     here would slide under the bar it is supposed to cover.
//   · Every control clears the 44px touch floor and the primary action of each
//     card sits at its foot, where the thumb already is.
//
// Behaviour kept, one for one, from the desktop build: the monthly/yearly
// switch with its Save tag; up = confirm then Stripe Checkout; down = confirm
// then the in-place `changePlan` (falling back to checkout when the org has no
// subscription yet); only the PRESSED button goes busy; the custom-plan picker,
// including the `?custom=1` deep link and the "add pages" variant for an org
// already on Custom; and the one-shot refresh on the ?session_id return leg so
// the sidebar's locks and quota pills redraw.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { expandPlanFeatures } from "@/lib/planCatalog";
import { changePlan, removeCustomPages } from "@/actions/billing";
import { toast } from "@/components/ui/Toast";
import {
  CUSTOM_BASE_CENTS,
  CUSTOM_PAGES,
  CUSTOM_PAGE_CENTS,
  CUSTOM_PLAN_SLUG,
  customPriceCents,
} from "@/lib/customPlan";
import type { UpgradePlan } from "@/components/v3/upgrade-blueprint/upgrade-content";
import "./mobile-upgrade.css";

/** How long the sheets take to leave. Must match the transition in the CSS. */
const SHEET_EXIT_MS = 220;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;

type Confirm =
  | { kind: "up"; plan: UpgradePlan }
  | { kind: "down"; plan: UpgradePlan }
  | { kind: "custom"; pages: string[] }
  | { kind: "remove"; pages: string[]; removing: string[] };

export type MobileUpgradeProps = {
  plans: UpgradePlan[];
  /** Subscription.plan as stored ("PROFESSIONAL", "CUSTOM", …), or null. */
  currentPlan: string | null;
  /** Pages a CUSTOM-plan org owns (ids from lib/customPlan), else []. */
  customPages: string[];
  isOwner: boolean;
  checkoutReady: boolean;
  /** The admin's payments switch is on the sandbox — say so, so a test charge
   *  is never mistaken for a real one. */
  sandbox: boolean;
  /** Slug just purchased on this request's ?session_id return, if any. */
  upgradedTo: string | null;
  cancelled: boolean;
  /** Rendered inside the subscription page: no shell, no head, no return-leg
   *  banners — the cards as a swipe carousel plus their sheets. */
  embedded?: boolean;
};

function Tick({ on }: { on: boolean }) {
  return (
    <svg className="mu-fic" viewBox="0 0 24 24" aria-hidden="true">
      {on ? <path d="M20 6 9 17l-5-5" /> : <path d="M5 12h14" />}
    </svg>
  );
}

export function MobileUpgradeContent({
  plans,
  currentPlan,
  customPages,
  isOwner,
  checkoutReady,
  sandbox,
  upgradedTo,
  cancelled,
  embedded = false,
}: MobileUpgradeProps) {
  const router = useRouter();
  /* MONTHLY ONLY for now (owner, 2026-09-04): the yearly tier is unreviewed,
     so the billing switch is gone from every plan surface. The type is kept
     wide so the price math below stays ready for the day it comes back. */
  const interval = "MONTH" as "MONTH" | "YEAR"; // cast, not annotation: TS narrows an annotated const to its literal
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // The current plan as the page knows it; moved locally after an in-place
  // switch so the labels flip before the refresh lands. Overrides win until the
  // refreshed props catch up (they then agree).
  const [curOverride, setCur] = useState<string | null>(null);
  const cur = curOverride ?? (currentPlan ?? "").toLowerCase();
  const [ownedOverride, setOwned] = useState<string[] | null>(null);
  const owned = ownedOverride ?? customPages;

  const scrollRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /* THE RETURN FROM STRIPE. The layout that draws the nav rendered BEFORE
     verifyReturn wrote the new plan, so locks and quota pills were stale until
     a manual reload. Refresh once, and drop the session id from the URL so a
     reload cannot re-verify. The banner is kept in state. */
  const [doneMsg] = useState<string | null>(upgradedTo);
  useEffect(() => {
    if (!upgradedTo) return;
    router.replace("/dashboard/upgrade");
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const doneName = doneMsg
    ? doneMsg === CUSTOM_PLAN_SLUG
      ? "the Custom plan"
      : (plans.find((p) => p.slug === doneMsg)?.name ?? doneMsg)
    : null;

  // The feature comparison, with "Everything in <plan>" expanded so a dearer
  // plan never reads as missing the cheaper plan's basics — the same fold the
  // desktop build and the signup step apply.
  const { rows: featureRows, included } = useMemo(() => expandPlanFeatures(plans), [plans]);


  /* Up or down, by price against the current plan. A custom plan (base plus
     pages) sits below every catalog tier. */
  const curCents = useMemo(() => {
    if (cur === CUSTOM_PLAN_SLUG) return customPriceCents(owned);
    return plans.find((p) => p.slug === cur)?.priceCents ?? -1;
  }, [cur, owned, plans]);
  /* UP OR DOWN — by tier, not by price (owner, 2026-09-04): the catalog's
     own order is the ladder and Custom is the rung below Starter whatever
     its pages add up to. */
  const rankOf = (slug: string): number =>
    slug === CUSTOM_PLAN_SLUG ? -1 : slug ? plans.findIndex((p) => p.slug === slug) : -2;
  const direction = (p: UpgradePlan): "up" | "down" => (rankOf(p.slug) > rankOf(cur) ? "up" : "down");

  const onCustom = cur === CUSTOM_PLAN_SLUG;

  /* ── SHEETS ────────────────────────────────────────────────────────────
     Both are mounted first and given `is-on` a frame later, so the box has a
     start state to slide out of; leaving removes the class and unmounts
     SHEET_EXIT_MS later. Same two-flag entrance as the desktop picker. */
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const id = requestAnimationFrame(() => setConfirmOn(true));
    return () => cancelAnimationFrame(id);
  }, [confirm]);
  const closeConfirm = useCallback(() => {
    setConfirmOn(false);
    window.setTimeout(() => setConfirm(null), SHEET_EXIT_MS);
  }, []);

  const searchParams = useSearchParams();
  // /dashboard/upgrade?custom=1 (the subscription page's "Build it", and the
  // custom-plan gate) lands straight in the page picker.
  const [pickerOpen, setPickerOpen] = useState(() => searchParams?.get("custom") === "1");
  const [pickerOn, setPickerOn] = useState(false);
  useEffect(() => {
    if (!pickerOpen) return;
    const id = requestAnimationFrame(() => setPickerOn(true));
    return () => cancelAnimationFrame(id);
  }, [pickerOpen]);
  const closePicker = useCallback(() => {
    setPickerOn(false);
    window.setTimeout(() => setPickerOpen(false), SHEET_EXIT_MS);
  }, []);

  /* The picker is the whole selection (owner, 2026-09-04: "add or remove").
     Ticking a new page is PAID — the selection replaces the subscription on
     Stripe's page; un-ticking only is free, the price steps down from the
     next bill (actions/billing.removeCustomPages). */
  const [picked, setPicked] = useState<string[]>([]);
  const openPicker = useCallback(() => {
    setPicked(onCustom ? owned : []);
    setPickerOpen(true);
  }, [onCustom, owned]);
  const adds = picked.filter((id) => !owned.includes(id));
  const removes = onCustom ? owned.filter((id) => !picked.includes(id)) : [];
  const nextMonthlyCents = customPriceCents(picked);

  async function removePages(removing: string[]) {
    if (busy || removing.length === 0) return;
    setErr(null);
    setBusy("custom-remove");
    try {
      const res = await removeCustomPages(removing);
      if (!res.ok) throw new Error(res.error);
      setOwned(res.pages);
      closeConfirm();
      toast.success(
        `${res.removed} page${res.removed === 1 ? "" : "s"} removed`,
        `Your plan is ${dollars(res.monthlyCents)}/mo from the next bill.`,
      );
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't remove the pages.");
      closeConfirm();
    } finally {
      setBusy(null);
    }
  }

  async function checkout(slug: string, customPagesToBuy?: string[]) {
    const res = await fetch("/api/checkout/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planSlug: slug, interval, customPages: customPagesToBuy }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't open checkout.");
    window.location.assign(body.url);
  }

  /* An upgrade (or a custom plan) is PAID on Stripe: confirm, then checkout.
     The return leg cancels the subscription it replaces. */
  const payFor = useCallback(
    async (slug: string, pages?: string[]) => {
      if (busy) return;
      setErr(null);
      setBusy(slug);
      try {
        await checkout(slug, pages); // navigates away on success
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't open checkout.");
        setBusy(null);
        closeConfirm();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, interval, closeConfirm],
  );

  /* A downgrade is switched in place, free. */
  const switchDown = useCallback(
    async (p: UpgradePlan) => {
      if (busy) return;
      setErr(null);
      setBusy(p.slug);
      try {
        const res = await changePlan(p.slug, interval);
        if (!res.ok) throw new Error(res.error);
        if (res.mode === "checkout") {
          await checkout(p.slug);
          return; // navigating away
        }
        setCur(p.slug);
        toast.success(`Moved to ${res.planName}`, "Nothing was charged. The lower price starts now.");
        // The layout re-renders with the new plan's locks and quota pills.
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't change the plan.");
      } finally {
        setBusy(null);
        closeConfirm();
      }
    },
     
    [busy, interval, router, closeConfirm],
  );

  function onPick(p: UpgradePlan) {
    setConfirm({ kind: direction(p) === "down" && cur ? "down" : "up", plan: p });
  }

  const cannot = !isOwner
    ? "Only the account owner can change the plan"
    : !checkoutReady
      ? "Checkout is not configured"
      : null;

  /* ── FEATURE DISCLOSURE ────────────────────────────────────────────────
     One open card at a time is deliberate: five expanded lists is a page you
     scroll for a minute, and the point of this surface is comparison. */
  const [openList, setOpenList] = useState<string | null>(null);

  /* ── MOTION: reveal on mount ───────────────────────────────────────────
     Applied ONCE, to the blocks that exist then, by the component. Never via a
     MutationObserver — this tree re-renders on every toggle, and an observer
     would replay the whole entrance each time a card was opened. */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const content = contentRef.current;
    if (!content) return;
    const blocks = Array.from(content.children) as HTMLElement[];
    blocks.forEach((el, i) => {
      el.classList.add("mu-rv");
      el.style.transitionDelay = `${i * 55}ms`;
    });
    const raf = requestAnimationFrame(() => {
      blocks.forEach((el) => el.classList.add("mu-rv-in"));
    });
    const done = window.setTimeout(
      () => blocks.forEach((el) => { el.style.transitionDelay = ""; }),
      55 * blocks.length + 460,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, []);

  /* ── MOTION: graph-paper parallax ──────────────────────────────────────── */
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

  /* ── MOTION: press stamp, delegated from the root ──────────────────────── */
  const onRootClick = useCallback((e: React.MouseEvent) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      ".mu-cta, .mu-seg-b, .mu-more, .mu-row",
    );
    if (!el) return;
    el.classList.remove("mu-pressed");
    void el.offsetWidth;
    el.classList.add("mu-pressed");
  }, []);
  const onRootAnimEnd = useCallback((e: React.AnimationEvent) => {
    const el = e.target as HTMLElement;
    if (el.classList?.contains("mu-pressed")) el.classList.remove("mu-pressed");
  }, []);

  /* Escape closes whichever sheet is up — the keyboard equivalent of the
     scrim tap, and the only way off a sheet with a hardware keyboard. */
  const sheetUp = confirm !== null || pickerOpen;
  useEffect(() => {
    if (!sheetUp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (confirm) closeConfirm();
      else closePicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetUp, busy, confirm, closeConfirm, closePicker]);

  /* ── CARD ──────────────────────────────────────────────────────────────── */

  const planCard = (p: UpgradePlan) => {
    const yearly = interval === "YEAR" ? p.yearlyPriceCents : null;
    const cents = yearly ?? p.priceCents;
    const listCents = yearly ? p.priceCents * 12 : 0;
    const savePct = yearly && listCents > yearly ? Math.round((1 - yearly / listCents) * 100) : 0;
    const isCur = cur === p.slug;
    const dir = direction(p);
    const has = included.get(p.slug);
    const mine = featureRows.filter((f) => has?.has(f.toLowerCase()));
    const rest = featureRows.filter((f) => !has?.has(f.toLowerCase()));
    const open = openList === p.slug;
    const preview = mine.slice(0, 3);

    return (
      <section
        key={p.slug}
        className={`mu-card${p.highlight ? " is-hero" : ""}${isCur ? " is-cur" : ""}`}
        aria-label={p.name}
      >
        <div className="mu-card-top">
          <div className="mu-card-id">
            <span className="mu-name">{p.name}</span>
            {p.description ? <span className="mu-desc">{p.description}</span> : null}
          </div>
          {/* Badges stack in a column beside the name (owner, 2026-09-04):
              side by side they squeezed "Professional" into a two-line break. */}
          {p.highlight || isCur ? (
            <span className="mu-tags">
              {p.highlight ? <span className="mu-tag">Most picked</span> : null}
              {isCur ? <span className="mu-tag is-cur">Current</span> : null}
            </span>
          ) : null}
        </div>

        <div className="mu-price">
          <b>{dollars(cents)}</b>
          <i>{yearly ? "/yr" : "/mo"}</i>
          {savePct > 0 ? (
            <span className="mu-save">
              <s>{dollars(listCents)}</s> save {savePct}%
            </span>
          ) : null}
        </div>

        <ul className="mu-feats">
          {preview.map((f) => (
            <li key={f} className="mu-f">
              <Tick on />
              <span>{f}</span>
            </li>
          ))}
          {open
            ? [
                ...mine.slice(3).map((f) => (
                  <li key={f} className="mu-f">
                    <Tick on />
                    <span>{f}</span>
                  </li>
                )),
                ...rest.map((f) => (
                  <li key={f} className="mu-f is-no">
                    <Tick on={false} />
                    <span>{f}</span>
                  </li>
                )),
              ]
            : null}
        </ul>

        {featureRows.length > preview.length ? (
          <button
            type="button"
            className={`mu-more${open ? " is-open" : ""}`}
            aria-expanded={open}
            onClick={() => setOpenList(open ? null : p.slug)}
          >
            {open ? "Hide the list" : `What's included · ${mine.length} of ${featureRows.length}`}
            <svg className="mu-chev" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : null}

        <div className="mu-foot">
          {isCur ? (
            <span className="mu-cur-lbl">Current plan</span>
          ) : (
            <button
              type="button"
              className={`mu-cta${dir === "down" && cur ? " is-ghost" : " is-primary"}`}
              disabled={Boolean(cannot) || busy === p.slug}
              aria-busy={busy === p.slug}
              title={cannot ?? undefined}
              onClick={() => onPick(p)}
            >
              {busy === p.slug ? "Switching…" : dir === "down" && cur ? "Downgrade" : "Upgrade"}
            </button>
          )}
        </div>
      </section>
    );
  };

  /* ── SHEET BODIES ──────────────────────────────────────────────────────── */

  const confirmTitle =
    confirm?.kind === "down"
      ? `Downgrade to ${confirm.plan.name}?`
      : confirm?.kind === "up"
        ? `Upgrade to ${confirm.plan.name}?`
        : confirm?.kind === "remove"
          ? `Remove ${confirm.removing.length} page${confirm.removing.length === 1 ? "" : "s"}?`
          : onCustom
            ? "Change your Custom plan?"
            : "Switch to a Custom plan?";

  const confirmLabel =
    confirm?.kind === "down"
      ? `Downgrade to ${confirm.plan.name}`
      : confirm?.kind === "remove"
        ? "Remove pages"
        : "Continue to payment";

  const confirmSheet =
    confirm && typeof document !== "undefined"
      ? createPortal(
          /* The scope class sits on a WRAPPER, never on the sheet itself: the
             root class also carries this page's fixed full-screen shell rules
             (see .mu-shell in the stylesheet), and a node holding both would
             lay the sheet out as a second copy of the page. */
          <div className="jf-mobile-upgrade mu-portal">
            <div
              className={`mu-sheet${confirmOn ? " is-on" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={confirmTitle}
            >
              <div
                className="mu-scrim"
                onClick={() => {
                  if (!busy) closeConfirm();
                }}
              />
              <div className="mu-box">
                <span className="mu-grab" aria-hidden="true" />
                <div className="mu-box-head">
                  <div className="mu-kick">
                    {confirm.kind === "down"
                      ? "Downgrade"
                      : confirm.kind === "remove"
                        ? "Custom plan"
                        : "Upgrade"}
                  </div>
                  <h2 className="mu-box-h">{confirmTitle}</h2>
                </div>
                <p className="mu-box-body">
                  {confirm.kind === "down" ? (
                    <>
                      You&rsquo;ll move to <b>{confirm.plan.name}</b> at{" "}
                      <b>{dollars(confirm.plan.priceCents)}/mo</b> right away. Nothing is charged
                      today; pages and limits that plan does not include close as soon as you
                      confirm.
                    </>
                  ) : confirm.kind === "up" ? (
                    <>
                      You&rsquo;ll be taken to Stripe to pay{" "}
                      <b>
                        {dollars(
                          interval === "YEAR"
                            ? (confirm.plan.yearlyPriceCents ?? confirm.plan.priceCents * 12)
                            : confirm.plan.priceCents,
                        )}
                        {interval === "YEAR" ? "/yr" : "/mo"}
                      </b>{" "}
                      for <b>{confirm.plan.name}</b>. Your current plan is replaced the moment the
                      payment goes through.
                    </>
                  ) : confirm.kind === "remove" ? (
                    <>
                      <b>
                        {confirm.removing
                          .map((id) => CUSTOM_PAGES.find((pg) => pg.id === id)?.label ?? id)
                          .join(", ")}
                      </b>{" "}
                      close{confirm.removing.length === 1 ? "s" : ""} as soon as you confirm. Your
                      plan is <b>{dollars(customPriceCents(confirm.pages))}/mo</b> from the next
                      bill; nothing is refunded for the rest of this cycle.
                    </>
                  ) : (
                    <>
                      You&rsquo;ll be taken to Stripe to pay{" "}
                      <b>
                        {dollars(customPriceCents(confirm.pages, interval))}
                        {interval === "YEAR" ? "/yr" : "/mo"}
                      </b>{" "}
                      for the base plus {confirm.pages.length} page
                      {confirm.pages.length === 1 ? "" : "s"}.
                      {cur ? " Your current plan is replaced the moment the payment goes through." : ""}
                    </>
                  )}
                </p>
                <div className="mu-box-foot">
                  <button
                    type="button"
                    className="mu-cta is-ghost"
                    disabled={Boolean(busy)}
                    onClick={() => closeConfirm()}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="mu-cta is-primary"
                    disabled={Boolean(busy)}
                    aria-busy={Boolean(busy)}
                    onClick={() => {
                      if (confirm.kind === "down") void switchDown(confirm.plan);
                      else if (confirm.kind === "up") void payFor(confirm.plan.slug);
                      else if (confirm.kind === "remove") void removePages(confirm.removing);
                      else void payFor(CUSTOM_PLAN_SLUG, confirm.pages);
                    }}
                  >
                    {busy ? "Working…" : confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const pickerSheet =
    pickerOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="jf-mobile-upgrade mu-portal">
            <div
              className={`mu-sheet is-tall${pickerOn ? " is-on" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={onCustom ? "Add or remove pages" : "Pick your pages"}
            >
              <div
                className="mu-scrim"
                onClick={() => {
                  if (busy !== "custom-remove") closePicker();
                }}
              />
              <div className="mu-box">
                <span className="mu-grab" aria-hidden="true" />
                <div className="mu-box-head">
                  <div className="mu-kick">Custom plan</div>
                  <h2 className="mu-box-h">{onCustom ? "Your pages." : "Pick your pages."}</h2>
                  <button
                    type="button"
                    className="mu-x"
                    aria-label="Close"
                    onClick={() => closePicker()}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="mu-box-body">
                  {onCustom
                    ? `Tick what you want in the plan — ${dollars(CUSTOM_PAGE_CENTS)}/mo each. Adding a page is paid on Stripe and replaces your plan; removing one is free and the lower price starts on the next bill.`
                    : `${dollars(CUSTOM_BASE_CENTS)}/mo covers the everyday workspace — proposals, clients, projects, jobs, invoices. Everything below is ${dollars(CUSTOM_PAGE_CENTS)}/mo each.`}
                </p>
                <div className="mu-list">
                  {CUSTOM_PAGES.map((pg) => {
                    const on = picked.includes(pg.id);
                    const had = owned.includes(pg.id);
                    return (
                      <button
                        key={pg.id}
                        type="button"
                        className={`mu-row${on ? " is-on" : ""}${onCustom && had && !on ? " is-drop" : ""}${onCustom && !had && on ? " is-add" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          setPicked((prev) =>
                            prev.includes(pg.id)
                              ? prev.filter((x) => x !== pg.id)
                              : [...prev, pg.id],
                          )
                        }
                      >
                        <span className="mu-check" aria-hidden="true">
                          {on ? (
                            <svg viewBox="0 0 24 24">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="mu-row-txt">
                          <span className="mu-row-n">{pg.label}</span>
                          <span className="mu-row-note">{pg.note}</span>
                        </span>
                        <span className="mu-row-p">
                          {onCustom && had ? (on ? "Yours" : "Removing") : `+${dollars(CUSTOM_PAGE_CENTS)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mu-list-foot">
                  <span className="mu-total">
                    <b>{dollars(nextMonthlyCents)}</b>
                    <i>
                      {onCustom
                        ? adds.length > 0
                          ? "per month · paid on Stripe"
                          : removes.length > 0
                            ? "per month from the next bill"
                            : "per month · your plan today"
                        : "per month · paid on Stripe"}
                    </i>
                  </span>
                  {onCustom ? (
                    <button
                      type="button"
                      className={`mu-cta${adds.length === 0 && removes.length > 0 ? " is-ghost" : " is-primary"}`}
                      disabled={(adds.length === 0 && removes.length === 0) || busy !== null}
                      onClick={() => {
                        closePicker();
                        if (adds.length > 0) setConfirm({ kind: "custom", pages: picked });
                        else setConfirm({ kind: "remove", pages: picked, removing: removes });
                      }}
                    >
                      {adds.length > 0
                        ? `Continue to payment · ${dollars(nextMonthlyCents)}/mo`
                        : removes.length > 0
                          ? `Remove ${removes.length} page${removes.length === 1 ? "" : "s"}`
                          : "No changes"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mu-cta is-primary"
                      disabled={busy !== null}
                      onClick={() => {
                        closePicker();
                        setConfirm({ kind: "custom", pages: picked });
                      }}
                    >
                      {`Switch to Custom · ${dollars(nextMonthlyCents)}/mo`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  /* ── PAGE ──────────────────────────────────────────────────────────────── */

  const customOpen = openList === CUSTOM_PLAN_SLUG;
  const customPreview = CUSTOM_PAGES.slice(0, 3);

  /* THE CUSTOM CARD. On the plan already: add or remove pages. Not on it:
     build one — pick pages, confirm, pay on Stripe like any other plan. */
  const customCard = (
          <section
            className={`mu-card is-custom${onCustom ? " is-cur" : ""}`}
            aria-label={onCustom ? "Custom plan" : "Build your plan"}
          >

            <div className="mu-card-top">
              <div className="mu-card-id">
                <span className="mu-name">{onCustom ? "Custom" : "Build your plan"}</span>
                <span className="mu-desc">
                  {dollars(CUSTOM_BASE_CENTS)} base · {dollars(CUSTOM_PAGE_CENTS)} per page
                </span>
              </div>
              {onCustom ? <span className="mu-tag is-cur">Current</span> : null}
            </div>

            <div className="mu-price">
              <b>{dollars(onCustom ? curCents : customPriceCents(picked))}</b>
              <i>/mo</i>
            </div>

            {/* ON THE PLAN: only the pages it holds, nothing when none
                (owner, 2026-09-04). OFF it: the add-on list, ticked as picked. */}
            <ul className="mu-feats">
              {onCustom
                ? CUSTOM_PAGES.filter((pg) => owned.includes(pg.id)).map((pg) => (
                    <li key={pg.id} className="mu-f">
                      <Tick on />
                      <span>{pg.label}</span>
                    </li>
                  ))
                : (customOpen ? CUSTOM_PAGES : customPreview).map((pg) => {
                    const has = picked.includes(pg.id);
                    return (
                      <li key={pg.id} className={`mu-f${has ? "" : " is-no"}`}>
                        <Tick on={has} />
                        <span>{pg.label}</span>
                      </li>
                    );
                  })}
              {onCustom && owned.length === 0 ? (
                <li className="mu-f is-no mu-f--none">No add-on pages yet</li>
              ) : null}
            </ul>

            {!onCustom ? (
              <button
                type="button"
                className={`mu-more${customOpen ? " is-open" : ""}`}
                aria-expanded={customOpen}
                onClick={() => setOpenList(customOpen ? null : CUSTOM_PLAN_SLUG)}
              >
                {customOpen ? "Hide the list" : `Add-on pages · ${picked.length} of ${CUSTOM_PAGES.length}`}
                <svg className="mu-chev" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : null}

            <div className="mu-foot">
              <button
                type="button"
                className="mu-cta is-primary"
                disabled={Boolean(cannot) || busy !== null}
                title={cannot ?? undefined}
                onClick={openPicker}
              >
                {onCustom
                  ? "Add or remove pages"
                  : busy === CUSTOM_PLAN_SLUG
                    ? "Opening Stripe…"
                    : "Choose pages"}
              </button>
            </div>
          </section>
  );

  /* EMBEDDED (the subscription page): the same cards as a swipe carousel,
     the interval switch above it, no shell chrome and no page head. The
     sheets still portal to <body>, so they work the same either way. */
  if (embedded) {
    return (
      <div className="jf-mobile-upgrade mu-embed" onClick={onRootClick} onAnimationEnd={onRootAnimEnd}>
        <div className="mu-embed-head">
          <div className="mu-embed-lbl">Plans</div>
        </div>
        {err ? (
          <div className="mu-note is-bad" role="alert">
            <b>That didn&rsquo;t go through</b>
            <span>{err}</span>
          </div>
        ) : null}
        <div className="mu-rail" ref={contentRef}>
          {plans.map(planCard)}
          {customCard}
        </div>
        {!isOwner ? (
          <p className="mu-fine">Plan changes are owner-only — ask the account owner.</p>
        ) : null}
        {confirmSheet}
        {pickerSheet}
      </div>
    );
  }

  return (
    <div
      className={`jf-mobile-upgrade mu-shell${sheetUp ? " is-locked" : ""}`}
      onClick={onRootClick}
      onAnimationEnd={onRootAnimEnd}
    >
      {/* Shared handheld chrome: dark topbar + slide-out drawer + icon sprite.
          It owns its own state and reads its token contract off this root. */}
      <MobileNav />

      <main className="mu-scroll" ref={scrollRef}>
        <div className="mu-content" ref={contentRef}>
          <div className="mu-head">
            <div className="mu-kick">Billing · plans</div>
            <h1 className="mu-title">Plans &amp; upgrade</h1>
            {cur ? (
              <p className="mu-lede">
                You&rsquo;re on{" "}
                <b>
                  {onCustom
                    ? `the Custom plan · ${dollars(curCents)}/mo`
                    : (plans.find((p) => p.slug === cur)?.name ?? currentPlan)}
                </b>
                {onCustom
                  ? " — add a page below, or switch to a full plan to open everything."
                  : "."}
              </p>
            ) : null}
          </div>


          {sandbox ? (
            <div className="mu-note is-warn" role="status">
              <b>Sandbox mode</b>
              <span>Payments here are Stripe TEST charges. Card 4242 4242 4242 4242 works.</span>
            </div>
          ) : null}
          {doneMsg ? (
            <div className="mu-done" role="status">
              <span className="mu-done-k">Done</span>
              <b>
                You&rsquo;re on {doneName} now.
              </b>
            </div>
          ) : null}
          {cancelled ? (
            <div className="mu-note is-bad" role="alert">
              <b>Checkout was cancelled</b>
              <span>Nothing changed.</span>
            </div>
          ) : null}
          {err ? (
            <div className="mu-note is-bad" role="alert">
              <b>That didn&rsquo;t go through</b>
              <span>{err}</span>
            </div>
          ) : null}

          {/* ONE ROW, swiped (owner, 2026-09-04) — the same rail the
              subscription page embeds, instead of a tall stack of cards. */}
          <div className="mu-rail">
            {plans.map(planCard)}
            {customCard}
          </div>

          {!isOwner ? (
            <p className="mu-fine">Plan changes are owner-only — ask the account owner.</p>
          ) : null}
          {!checkoutReady ? (
            <p className="mu-fine">Checkout is not configured on this deployment yet.</p>
          ) : null}
          {!onCustom ? (
            <p className="mu-fine">
              Build your plan: {dollars(CUSTOM_BASE_CENTS)} base covers proposals, clients,
              projects, jobs, invoices and financials; each extra page is{" "}
              {dollars(CUSTOM_PAGE_CENTS)}/mo.
            </p>
          ) : null}
        </div>
      </main>

      {confirmSheet}
      {pickerSheet}
    </div>
  );
}
