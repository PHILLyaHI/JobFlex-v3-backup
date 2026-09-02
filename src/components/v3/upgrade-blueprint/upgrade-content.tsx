"use client";

// PLANS & UPGRADE — the client half of /dashboard/upgrade. See the page for
// what this surface is; see upgrade.css for why the styling is a plain,
// self-scoped stylesheet.
//
// The card language is the signup plan step's, re-cut for an org that already
// exists: current plan is labelled instead of selectable, the CTA charges the
// signed-in org (POST /api/checkout/subscription) rather than parking a
// pending intent, and non-owners see the plans but cannot buy — billing is
// owner-only app-wide, and a disabled button with the reason beats a button
// that 403s.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { expandPlanFeatures } from "@/lib/planCatalog";
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
  isOwner,
  checkoutReady,
  sandbox,
  upgradedTo,
  cancelled,
}: {
  plans: UpgradePlan[];
  /** Subscription.plan as stored ("PROFESSIONAL", "CUSTOM", …), or null. */
  currentPlan: string | null;
  isOwner: boolean;
  checkoutReady: boolean;
  /** The admin's payments switch is on the sandbox — say so on the page, so a
   *  test charge is never mistaken for a real one. */
  sandbox: boolean;
  /** Slug just purchased on this request's ?session_id return, if any. */
  upgradedTo: string | null;
  cancelled: boolean;
}) {
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("MONTH");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cur = (currentPlan ?? "").toLowerCase();

  // The feature comparison, with "Everything in <plan>" expanded so a dearer
  // plan never reads as missing the cheaper plan's basics — the same rule the
  // signup step applies (lib/planCatalog.expandPlanFeatures).
  const { rows: featureRows, included } = useMemo(() => expandPlanFeatures(plans), [plans]);

  const yearlySavePct = useMemo(() => {
    const ref =
      plans.find((p) => p.highlight && p.priceCents > 0 && p.yearlyPriceCents) ??
      plans.find((p) => p.priceCents > 0 && p.yearlyPriceCents);
    if (!ref?.yearlyPriceCents) return null;
    const list = ref.priceCents * 12;
    return list > ref.yearlyPriceCents ? Math.round((1 - ref.yearlyPriceCents / list) * 100) : null;
  }, [plans]);

  async function buy(slug: string) {
    if (busy) return;
    setErr(null);
    setBusy(slug);
    try {
      const res = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: slug, interval }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Couldn't open checkout.");
      window.location.assign(body.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open checkout.");
      setBusy(null);
    }
  }

  return (
    <div className="jf-upgrade">
      <div className="jf-up-head">
        <div>
          <div className="jf-up-kick">Billing · plans</div>
          <h1 className="jf-up-h1">Plans &amp; upgrade.</h1>
          {currentPlan ? (
            <p className="jf-up-cur">
              You&apos;re on <b>{currentPlan.toLowerCase() === "custom" ? "the Custom plan" : currentPlan}</b>
              {cur === "custom" ? " — upgrading to a full plan opens every page, no picking." : "."}
            </p>
          ) : null}
        </div>
        <div className="jf-up-int" role="group" aria-label="Billing period">
          {(["MONTH", "YEAR"] as const).map((i) => (
            <button
              key={i}
              type="button"
              className={"jf-up-int-b" + (interval === i ? " on" : "")}
              aria-pressed={interval === i}
              onClick={() => setInterval(i)}
            >
              {i === "MONTH" ? "Monthly" : "Yearly"}
              {i === "YEAR" && yearlySavePct ? <i>Save {yearlySavePct}%</i> : null}
            </button>
          ))}
        </div>
      </div>

      {sandbox ? (
        <div className="jf-up-sand" role="status">
          Sandbox mode — payments here are Stripe TEST charges. Card 4242 4242 4242 4242 works.
        </div>
      ) : null}
      {upgradedTo ? (
        <div className="jf-up-ok" role="status">
          Done — you&apos;re on <b>{upgradedTo}</b> now.
        </div>
      ) : null}
      {cancelled ? (
        <div className="jf-up-err" role="alert">
          Checkout was cancelled — nothing changed.
        </div>
      ) : null}
      {err ? (
        <div className="jf-up-err" role="alert">
          {err}
        </div>
      ) : null}

      <div className="jf-up-plans">
        {plans.map((p) => {
          const yearly = interval === "YEAR" ? p.yearlyPriceCents : null;
          const cents = yearly ?? p.priceCents;
          const listCents = yearly ? p.priceCents * 12 : 0;
          const savePct =
            yearly && listCents > yearly ? Math.round((1 - yearly / listCents) * 100) : 0;
          const isCur = cur === p.slug;
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
              {isCur ? (
                <span className="jf-up-curlbl">Current plan</span>
              ) : (
                <button
                  className="jf-up-go"
                  type="button"
                  disabled={!isOwner || !checkoutReady || Boolean(busy)}
                  title={
                    !isOwner
                      ? "Only the account owner can change the plan"
                      : !checkoutReady
                        ? "Checkout is not configured"
                        : undefined
                  }
                  onClick={() => void buy(p.slug)}
                >
                  {busy === p.slug ? "Opening checkout…" : `Switch to ${p.name}`}
                </button>
              )}
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
            </div>
          );
        })}
      </div>

      {!isOwner ? (
        <p className="jf-up-note">Plan changes are owner-only — ask the account owner.</p>
      ) : null}
      <p className="jf-up-note">
        Custom plan pages are picked at signup today; to change a custom selection,{" "}
        <Link href={"/dashboard/support" as Route}>message support</Link> or switch to a full plan
        above.
      </p>
    </div>
  );
}
