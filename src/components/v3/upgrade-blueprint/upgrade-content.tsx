"use client";

// PLANS & UPGRADE — the client half of /dashboard/upgrade. See the page for
// what this surface is; see upgrade.css for why the styling is a plain,
// self-scoped stylesheet.
//
// 2026-09-02 REWORK (owner's calls):
//   · A plan change is made IN PLACE on the existing Stripe subscription
//     (actions/billing.changePlan): up charges the prorated difference now,
//     down is free — checkout only when there is no subscription yet. The old
//     build opened a fresh Checkout for every click, which minted a SECOND
//     subscription beside the first.
//   · Cards are one fixed height; the benefit list scrolls inside them and
//     the button sits at the foot of every card, full width, blueprint blue.
//   · Only the clicked button goes busy. `disabled={Boolean(busy)}` used to
//     dim all three the moment one was pressed.
//   · A downgrade asks first ("Are you sure…?").
//   · After a change the router is refreshed, so the sidebar's locks and
//     quota pills redraw without a manual reload — including on the return
//     leg from Stripe, where the page is reached with ?session_id.
//   · CUSTOM PLAN: an org already on it can ADD PAGES here. The page is
//     charged once now ($10 each), the subscription price steps up, and the
//     next cycle bills the new total — no second charge for the base.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { expandPlanFeatures } from "@/lib/planCatalog";
import { changePlan, removeCustomPages } from "@/actions/billing";
import { ConfirmPlanChange } from "@/components/billing/ConfirmPlanChange";
import { toast } from "@/components/ui/Toast";
import {
  CUSTOM_BASE_CENTS,
  CUSTOM_PAGES,
  CUSTOM_PAGE_CENTS,
  CUSTOM_PLAN_SLUG,
  customPriceCents,
} from "@/lib/customPlan";
import "./upgrade.css";

export type UpgradePlan = {
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number;
  features: string[];
  highlight: boolean;
};

export function UpgradeContent({
  plans,
  currentPlan,
  customPages,
  isOwner,
  checkoutReady,
  sandbox,
  upgradedTo,
  cancelled,
  embedded = false,
}: {
  plans: UpgradePlan[];
  /** Subscription.plan as stored ("PROFESSIONAL", "CUSTOM", …), or null. */
  currentPlan: string | null;
  /** Pages a CUSTOM-plan org owns (ids from lib/customPlan), else []. */
  customPages: string[];
  isOwner: boolean;
  checkoutReady: boolean;
  /** The admin's payments switch is on the sandbox — say so on the page, so a
   *  test charge is never mistaken for a real one. */
  sandbox: boolean;
  /** Slug just purchased on this request's ?session_id return, if any. */
  upgradedTo: string | null;
  cancelled: boolean;
  /** Rendered inside another page (the subscription page's plan section):
   *  no page head, no return-leg banners — just the cards and their dialogs. */
  embedded?: boolean;
}) {
  const router = useRouter();
  // False on the server render and the hydration pass, true after: the portal
  // below must not exist on the first client render or React reports a
  // hydration mismatch on ?custom=1 (agent's finding, 2026-09-02).
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  /* MONTHLY ONLY for now (owner, 2026-09-04): the yearly tier is unreviewed,
     so the billing switch is gone from every plan surface. The type is kept
     wide so the price math below stays ready for the day it comes back. */
  const interval = "MONTH" as "MONTH" | "YEAR"; // cast, not annotation: TS narrows an annotated const to its literal
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The current plan as the page knows it; moved locally after an in-place
  // switch so the labels flip before the refresh lands.
  // Overrides win until the refreshed props catch up (they then agree).
  const [curOverride, setCur] = useState<string | null>(null);
  const cur = curOverride ?? (currentPlan ?? "").toLowerCase();
  const [ownedOverride, setOwned] = useState<string[] | null>(null);
  const owned = ownedOverride ?? customPages;

  /* THE RETURN FROM STRIPE. The layout that draws the sidebar rendered
     BEFORE verifyReturn wrote the new plan, so locks and quota pills were
     stale until a manual reload. Refresh once, and drop the session id from
     the URL so a reload cannot re-verify. The banner is kept in state. */
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
  // plan never reads as missing the cheaper plan's basics — the same rule the
  // signup step applies (lib/planCatalog.expandPlanFeatures).
  const { rows: featureRows, included } = useMemo(() => expandPlanFeatures(plans), [plans]);


  const curCents = useMemo(() => {
    if (cur === CUSTOM_PLAN_SLUG) return customPriceCents(owned);
    return plans.find((p) => p.slug === cur)?.priceCents ?? -1;
  }, [cur, owned, plans]);
  /* UP OR DOWN — by tier, not by price (owner, 2026-09-04). The catalog's
     own order is the ladder (Starter < Professional < Enterprise, as
     /admin/plans sorts them) and the Custom plan is the rung below Starter
     whatever its page count adds up to. So from Custom every catalog plan is
     an upgrade, and from any catalog plan Custom is a downgrade. No plan at
     all ranks below everything. */
  const rankOf = (slug: string): number =>
    slug === CUSTOM_PLAN_SLUG ? -1 : slug ? plans.findIndex((p) => p.slug === slug) : -2;
  const direction = (p: UpgradePlan): "up" | "down" => (rankOf(p.slug) > rankOf(cur) ? "up" : "down");

  /* What is being asked. "up" and "custom" go to Stripe to be paid for (the
     owner's rule: an upgrade is confirmed, then paid on Stripe's page, and it
     replaces the current subscription on the return); "down" is switched in
     place, free. */
  const [confirm, setConfirm] = useState<
    | { kind: "up"; plan: UpgradePlan }
    | { kind: "down"; plan: UpgradePlan }
    | { kind: "custom"; pages: string[] }
    | { kind: "remove"; pages: string[]; removing: string[] }
    | null
  >(null);

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
        setConfirm(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, interval],
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
        setConfirm(null);
      }
    },
     
    [busy, interval, router],
  );

  function onPick(p: UpgradePlan) {
    setConfirm({ kind: direction(p) === "down" && cur ? "down" : "up", plan: p });
  }

  /* ── CUSTOM PLAN ─────────────────────────────────────────────────────
     On it already: add pages (paid once now, price steps up). Not on it:
     build one — pick pages, confirm, pay on Stripe like any other plan. */
  const onCustom = cur === CUSTOM_PLAN_SLUG;
  const searchParams = useSearchParams();
  // /dashboard/upgrade?custom=1 (the subscription page's "Build it") lands
  // straight in the page picker.
  const [pickerOpen, setPickerOpen] = useState(() => searchParams?.get("custom") === "1");
  // The same two-flag entrance as the signup step's picker: mounted first,
  // `is-on` a frame later so the box has a start state to leave from.
  const [pickerOn, setPickerOn] = useState(false);
  useEffect(() => {
    if (!pickerOpen) return;
    const id = requestAnimationFrame(() => setPickerOn(true));
    return () => cancelAnimationFrame(id);
  }, [pickerOpen]);
  const closePicker = useCallback(() => {
    setPickerOn(false);
    window.setTimeout(() => setPickerOpen(false), 220);
  }, []);
  /* The picker is the whole selection (owner, 2026-09-04: "add or remove").
     On the plan it opens with the owned pages ticked; what is ticked when
     the user is done is the plan they want. Ticking a new page is PAID —
     the new selection replaces the subscription on Stripe's page, like any
     upgrade. Un-ticking only is free: the pages close now and the price
     steps down from the next bill (actions/billing.removeCustomPages). */
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
      setConfirm(null);
      toast.success(
        `${res.removed} page${res.removed === 1 ? "" : "s"} removed`,
        `Your plan is $${(res.monthlyCents / 100).toFixed(0)}/mo from the next bill.`,
      );
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't remove the pages.");
      setConfirm(null);
    } finally {
      setBusy(null);
    }
  }

  const cannot = !isOwner
    ? "Only the account owner can change the plan"
    : !checkoutReady
      ? "Checkout is not configured"
      : null;

  return (
    <div className={"jf-upgrade" + (embedded ? " jf-up-embed" : "")}>
      <div className={"jf-up-head" + (embedded ? " jf-up-head--embed" : "")}>
        {embedded ? (
          <div className="jf-up-embed-lbl">Plans</div>
        ) : (
        <div>
          <div className="jf-up-kick">Billing · plans</div>
          <h1 className="jf-up-h1">Plans &amp; upgrade.</h1>
          {cur ? (
            <p className="jf-up-cur">
              You&apos;re on{" "}
              <b>
                {onCustom
                  ? `the Custom plan · $${(curCents / 100).toFixed(0)}/mo`
                  : (plans.find((p) => p.slug === cur)?.name ?? currentPlan)}
              </b>
              {onCustom
                ? " — add a page below, or switch to a full plan to open everything."
                : "."}
            </p>
          ) : null}
        </div>
        )}
      </div>

      {sandbox ? (
        <div className="jf-up-sand" role="status">
          Sandbox mode — payments here are Stripe TEST charges. Card 4242 4242 4242 4242 works.
        </div>
      ) : null}
      {doneMsg && !embedded ? (
        <div className="jf-up-ok" role="status">
          Done — you&apos;re on <b>{doneName}</b> now.
        </div>
      ) : null}
      {cancelled && !embedded ? (
        <div className="jf-up-err" role="alert">
          Checkout was cancelled — nothing changed.
        </div>
      ) : null}
      {err ? (
        <div className="jf-up-err" role="alert">
          {err}
        </div>
      ) : null}

      <div className="jf-up-plans has-custom">
        {plans.map((p) => {
          const yearly = interval === "YEAR" ? p.yearlyPriceCents : null;
          const cents = yearly ?? p.priceCents;
          const listCents = yearly ? p.priceCents * 12 : 0;
          const savePct =
            yearly && listCents > yearly ? Math.round((1 - yearly / listCents) * 100) : 0;
          const isCur = cur === p.slug;
          const dir = direction(p);
          return (
            <div
              key={p.slug}
              className={"jf-up-plan" + (p.highlight ? " hero" : "") + (isCur ? " cur" : "")}
            >
              {p.highlight ? <span className="jf-up-tag">Most picked</span> : null}
              <span className="jf-up-n">{p.name}</span>
              <span className="jf-up-price">
                ${(cents / 100).toFixed(0)}
                <i>{yearly ? "/yr" : "/mo"}</i>
              </span>
              {savePct > 0 ? (
                <span className="jf-up-save">
                  <s>${(listCents / 100).toFixed(0)}</s> Save {savePct}%
                </span>
              ) : null}
              <span className="jf-up-feats">
                {featureRows.map((f) => {
                  const has = included.get(p.slug)?.has(f.toLowerCase()) ?? false;
                  return (
                    <span key={f} className={"jf-up-f" + (has ? "" : " no")}>
                      <svg viewBox="0 0 24 24" className="jf-up-fic" aria-hidden="true">
                        {has ? <path d="M20 6 9 17l-5-5" /> : <path d="M5 12h14" />}
                      </svg>
                      {f}
                    </span>
                  );
                })}
              </span>
              {isCur ? (
                <span className="jf-up-curlbl">Current plan</span>
              ) : (
                <button
                  className={"jf-up-go" + (dir === "down" ? " down" : "")}
                  type="button"
                  disabled={Boolean(cannot) || busy === p.slug}
                  aria-busy={busy === p.slug}
                  title={cannot ?? undefined}
                  onClick={() => onPick(p)}
                >
                  {busy === p.slug ? "Switching…" : dir === "down" && cur ? "Downgrade" : "Upgrade"}
                </button>
              )}
            </div>
          );
        })}

        {(
          <div className={"jf-up-plan custom" + (onCustom ? " cur" : "")}>
            <span className="jf-up-n">{onCustom ? "Custom" : "Build your plan"}</span>
            <span className="jf-up-price">
              ${((onCustom ? curCents : customPriceCents(picked)) / 100).toFixed(0)}
              <i>/mo</i>
            </span>
            <span className="jf-up-save">
              ${(CUSTOM_BASE_CENTS / 100).toFixed(0)} base · ${(CUSTOM_PAGE_CENTS / 100).toFixed(0)}{" "}
              per page
            </span>
            {/* ON THE PLAN: only the pages it holds — nothing when it holds
                none (owner, 2026-09-04). OFF it: every page, ticked as picked. */}
            <span className="jf-up-feats">
              {onCustom
                ? CUSTOM_PAGES.filter((pg) => owned.includes(pg.id)).map((pg) => (
                    <span key={pg.id} className="jf-up-f">
                      <svg viewBox="0 0 24 24" className="jf-up-fic" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {pg.label}
                    </span>
                  ))
                : CUSTOM_PAGES.map((pg) => {
                    const has = picked.includes(pg.id);
                    return (
                      <span key={pg.id} className={"jf-up-f" + (has ? "" : " no")}>
                        <svg viewBox="0 0 24 24" className="jf-up-fic" aria-hidden="true">
                          {has ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 5v14M5 12h14" />}
                        </svg>
                        {pg.label}
                      </span>
                    );
                  })}
              {onCustom && owned.length === 0 ? (
                <span className="jf-up-f no jf-up-f--none">No add-on pages yet</span>
              ) : null}
            </span>
            <button
              className="jf-up-go"
              type="button"
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
        )}
      </div>

      {!isOwner ? (
        <p className="jf-up-note">Plan changes are owner-only — ask the account owner.</p>
      ) : null}
      {!onCustom ? (
        <p className="jf-up-note">
          Build your plan: ${(CUSTOM_BASE_CENTS / 100).toFixed(0)} base covers proposals, clients,
          projects, jobs, invoices and financials; each extra page is $
          {(CUSTOM_PAGE_CENTS / 100).toFixed(0)}/mo.
        </p>
      ) : null}

      <ConfirmPlanChange
        open={confirm !== null}
        kicker={
          confirm?.kind === "down"
            ? "Downgrade"
            : confirm?.kind === "remove"
              ? "Custom plan"
              : "Upgrade"
        }
        title={
          confirm?.kind === "down"
            ? `Downgrade to ${confirm.plan.name}?`
            : confirm?.kind === "up"
              ? `Upgrade to ${confirm.plan.name}?`
              : confirm?.kind === "remove"
                ? `Remove ${confirm.removing.length} page${confirm.removing.length === 1 ? "" : "s"}?`
                : onCustom
                  ? "Change your Custom plan?"
                  : "Switch to a Custom plan?"
        }
        body={
          confirm?.kind === "down" ? (
            <>
              You&rsquo;ll move to <b>{confirm.plan.name}</b> at{" "}
              <b>${(confirm.plan.priceCents / 100).toFixed(0)}/mo</b> right away. Nothing is
              charged today; pages and limits that plan does not include close as soon as you
              confirm.
            </>
          ) : confirm?.kind === "up" ? (
            <>
              You&rsquo;ll be taken to Stripe to pay{" "}
              <b>
                $
                {(
                  (interval === "YEAR"
                    ? (confirm.plan.yearlyPriceCents ?? confirm.plan.priceCents * 12)
                    : confirm.plan.priceCents) / 100
                ).toFixed(0)}
                {interval === "YEAR" ? "/yr" : "/mo"}
              </b>{" "}
              for <b>{confirm.plan.name}</b>. Your current plan is replaced the moment the payment
              goes through.
            </>
          ) : confirm?.kind === "custom" ? (
            <>
              You&rsquo;ll be taken to Stripe to pay{" "}
              <b>
                ${(customPriceCents(confirm.pages, interval) / 100).toFixed(0)}
                {interval === "YEAR" ? "/yr" : "/mo"}
              </b>{" "}
              for the base plus {confirm.pages.length} page{confirm.pages.length === 1 ? "" : "s"}.
              {cur ? " Your current plan is replaced the moment the payment goes through." : ""}
            </>
          ) : confirm?.kind === "remove" ? (
            <>
              <b>
                {confirm.removing
                  .map((id) => CUSTOM_PAGES.find((pg) => pg.id === id)?.label ?? id)
                  .join(", ")}
              </b>{" "}
              close{confirm.removing.length === 1 ? "s" : ""} as soon as you confirm. Your plan is{" "}
              <b>${(customPriceCents(confirm.pages) / 100).toFixed(0)}/mo</b> from the next bill;
              nothing is refunded for the rest of this cycle.
            </>
          ) : null
        }
        confirmLabel={
          confirm?.kind === "down"
            ? `Downgrade to ${confirm.plan.name}`
            : confirm?.kind === "remove"
              ? "Remove pages"
              : "Continue to payment"
        }
        busy={busy !== null}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "down") void switchDown(confirm.plan);
          else if (confirm.kind === "up") void payFor(confirm.plan.slug);
          else if (confirm.kind === "remove") void removePages(confirm.removing);
          else void payFor(CUSTOM_PLAN_SLUG, confirm.pages);
        }}
        onCancel={() => setConfirm(null)}
      />

      {/* THE PAGE PICKER for a custom plan — the signup step's dialog, re-cut
          for "add", with the two numbers that matter: what is charged now and
          what the plan costs from the next bill. */}
      {pickerOpen && isClient ? createPortal(
        /* The scope class sits on a WRAPPER: `.jf-upgrade .jf-up-pick` needs
           an ancestor, and a root that carried both classes matched only the
           page-level flex rule — the picker laid out inline at the foot of
           <body>, invisible, and "Choose pages" read as dead (owner). */
        <div className="jf-upgrade jf-up-portal">
        <div className={"jf-up-pick" + (pickerOn ? " is-on" : "")} role="dialog" aria-modal="true" aria-label="Add pages to your plan">
          <div className="jf-up-pick-scrim" onClick={() => busy !== "custom-remove" && closePicker()} />
          <div className="jf-up-pick-box">
            <div className="jf-up-pick-head">
              <div>
                <div className="jf-up-kick">Custom plan</div>
                <h2 className="jf-up-pick-h">{onCustom ? "Your pages." : "Pick your pages."}</h2>
              </div>
              <button
                type="button"
                className="jf-up-pick-x"
                aria-label="Close"
                onClick={() => closePicker()}
              >
                ×
              </button>
            </div>
            <p className="jf-up-pick-lede">
              {onCustom
                ? `Tick what you want in the plan — $${(CUSTOM_PAGE_CENTS / 100).toFixed(0)}/mo each. Adding a page is paid on Stripe and replaces your plan; removing one is free and the lower price starts on the next bill.`
                : `$${(CUSTOM_BASE_CENTS / 100).toFixed(0)}/mo covers the everyday workspace — proposals, clients, projects, jobs, invoices. Everything below is $${(CUSTOM_PAGE_CENTS / 100).toFixed(0)}/mo each.`}
            </p>
            <div className="jf-up-pick-list">
              {CUSTOM_PAGES.map((pg) => {
                const on = picked.includes(pg.id);
                const had = owned.includes(pg.id);
                return (
                  <button
                    key={pg.id}
                    type="button"
                    className={
                      "jf-up-pick-row" +
                      (on ? " on" : "") +
                      (onCustom && had && !on ? " drop" : "") +
                      (onCustom && !had && on ? " add" : "")
                    }
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((cur) =>
                        cur.includes(pg.id) ? cur.filter((x) => x !== pg.id) : [...cur, pg.id],
                      )
                    }
                  >
                    <span className="jf-up-pick-box-t" aria-hidden="true">
                      {on ? (
                        <svg viewBox="0 0 24 24">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="jf-up-pick-txt">
                      <span className="jf-up-pick-n">{pg.label}</span>
                      <span className="jf-up-pick-note">{pg.note}</span>
                    </span>
                    <span className="jf-up-pick-p">
                      {onCustom && had ? (on ? "Yours" : "Removing") : `+$${(CUSTOM_PAGE_CENTS / 100).toFixed(0)}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="jf-up-pick-foot">
              <span className="jf-up-pick-total">
                <b>${(nextMonthlyCents / 100).toFixed(0)}</b>
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
                  className={"jf-up-go" + (adds.length === 0 && removes.length > 0 ? " down" : "")}
                  disabled={(adds.length === 0 && removes.length === 0) || busy !== null}
                  onClick={() => {
                    closePicker();
                    if (adds.length > 0) setConfirm({ kind: "custom", pages: picked });
                    else setConfirm({ kind: "remove", pages: picked, removing: removes });
                  }}
                >
                  {adds.length > 0
                    ? `Continue to payment · $${(nextMonthlyCents / 100).toFixed(0)}/mo`
                    : removes.length > 0
                      ? `Remove ${removes.length} page${removes.length === 1 ? "" : "s"}`
                      : "No changes"}
                </button>
              ) : (
                <button
                  type="button"
                  className="jf-up-go"
                  disabled={busy !== null}
                  onClick={() => {
                    closePicker();
                    setConfirm({ kind: "custom", pages: picked });
                  }}
                >
                  {`Switch to Custom · $${(nextMonthlyCents / 100).toFixed(0)}/mo`}
                </button>
              )}
            </div>
          </div>
        </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
