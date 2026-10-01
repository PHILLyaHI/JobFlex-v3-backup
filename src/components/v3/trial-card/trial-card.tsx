"use client";

// THE CARD-LESS TRIAL'S TWO SURFACES (owner, 2026-10-01; lib/cardlessTrial):
//   · TrialRibbon — over every dashboard page: "N days left · Add a card to
//     keep access" with the button, or "Trial ended · read-only" with the way
//     back. A card already on file turns it quiet.
//   · TrialSheet — /dashboard/trial: the plan and its price, and the one
//     action. "Add a card to continue" once the trial has ended.
// The button asks /api/billing/trial-card for Stripe Checkout and leaves for
// it. Only the owner adds the card; everyone else is told who can.
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import type { TrialView } from "@/lib/cardlessTrial";
import { metaTrack, newEventId } from "@/lib/metaPixel";
import s from "./trial-card.module.css";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function useAddCard() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const leaving = React.useRef(false);
  React.useEffect(() => {
    // Back from Stripe through the back/forward cache: idle again.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && leaving.current) {
        leaving.current = false;
        setBusy(false);
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const go = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Meta InitiateCheckout as the card form opens: the browser's copy here,
      // the server's from the route, one event id between them.
      const eventId = newEventId();
      const res = await fetch("/api/billing/trial-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string; purpose?: string };
      if (res.ok && body.url) {
        metaTrack("InitiateCheckout", { content_category: body.purpose ?? "trial-card" }, eventId);
        leaving.current = true;
        window.location.href = body.url;
        return;
      }
      setError(body.error || "Couldn't open the card form. Try again.");
    } catch {
      setError("Couldn't reach billing. Try again.");
    }
    setBusy(false);
  }, [busy]);
  return { go, busy, error };
}

function daysText(n: number): string {
  if (n <= 0) return "Ends today";
  return n === 1 ? "1 day left" : `${n} days left`;
}

export function TrialRibbon({ view, isOwner }: { view: TrialView; isOwner: boolean }) {
  const { go, busy, error } = useAddCard();
  const ended = view.kind === "ended";
  const tone = ended ? s.isEnded : view.hasCard ? s.isCard : view.daysLeft <= 2 ? s.isSoon : "";
  return (
    <div className={`${s.ribbon} ${tone}`} role={ended ? "alert" : "status"}>
      <span className={s.stamp}>{ended ? "Trial ended" : view.hasCard ? "Card on file" : daysText(view.daysLeft)}</span>
      <p className={s.ribbonText}>
        {ended ? (
          <>
            <b>Add a card to continue.</b> <span>Your workspace is read-only until then — nothing is lost.</span>
          </>
        ) : view.hasCard ? (
          <>
            <b>You&rsquo;re set.</b> <span>{view.planName} starts on {DATE.format(new Date(view.endsAt))} at {view.price}.</span>
          </>
        ) : (
          <>
            <b>Add a card to keep access.</b> <span>Free until {DATE.format(new Date(view.endsAt))}, then {view.planName} at {view.price}.</span>
          </>
        )}
        {error ? <span role="alert"> {error}</span> : null}
      </p>
      {view.hasCard && !ended ? null : isOwner ? (
        ended ? (
          <Link className={s.button} href={"/dashboard/trial" as Route}>
            Add a card
          </Link>
        ) : (
          <button type="button" className={s.button} onClick={() => void go()} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Opening…" : "Add card"}
          </button>
        )
      ) : (
        <span className={s.ribbonText}>
          <span>Ask the owner to add a card.</span>
        </span>
      )}
    </div>
  );
}

export function TrialSheet({
  view,
  isOwner,
  notice,
}: {
  view: TrialView;
  isOwner: boolean;
  /** The return from Stripe: "added" / "cancelled" / an error line. */
  notice: { tone: "ok" | "error" | "plain"; text: string } | null;
}) {
  const { go, busy, error } = useAddCard();
  const ended = view.kind === "ended";
  const tone = ended ? s.isEnded : view.hasCard ? s.isCard : view.daysLeft <= 2 ? s.isSoon : "";
  const when = DATE.format(new Date(view.endsAt));
  const title = ended ? "Add a card to continue" : view.hasCard ? "Your card is on file" : "Add a card to keep access";
  const lede = ended
    ? `Your 7-day trial ended on ${when}. Everything you made is still here and readable; add a card and ${view.planName} starts again today — no new trial.`
    : view.hasCard
      ? `Nothing to do. The trial runs until ${when}, then ${view.planName} begins and the card is charged.`
      : `The trial is free until ${when}. Add a card before then and ${view.planName} carries on without a gap. Without one, the workspace turns read-only on ${when}.`;
  return (
    <div className={s.page}>
      {notice ? (
        <p className={`${s.note} ${notice.tone === "ok" ? s.ok : notice.tone === "error" ? s.error : ""}`} role="status">
          {notice.text}
        </p>
      ) : null}
      <section className={`${s.sheet} ${tone}`} aria-labelledby="trial-title">
        <header className={s.sheetHead}>
          <span className={s.kicker}>Free trial · no card</span>
          <span className={s.stamp}>
            {ended ? "Ended" : view.hasCard ? "Card on file" : daysText(view.daysLeft)}
          </span>
        </header>
        <div className={s.sheetBody}>
          <h1 id="trial-title" className={s.title}>
            {title}
          </h1>
          <p className={s.lede}>{lede}</p>
          <div className={s.plan}>
            <span className={s.planName}>{view.planName}</span>
            <span className={s.planPrice}>
              {view.price.replace(/\/(mo|yr)$/, "")}
              <i>/{view.price.endsWith("/yr") ? "yr" : "mo"}</i>
            </span>
            <span className={s.planNote}>
              {ended ? "Charged today, then monthly. Cancel any time from Subscription." : `First charge ${when}, then monthly. Cancel any time from Subscription.`}
            </span>
          </div>
          {view.hasCard && !ended ? (
            <div className={s.actions}>
              <Link className={s.quiet} href={"/dashboard" as Route}>
                Back to the dashboard
              </Link>
            </div>
          ) : isOwner ? (
            <div className={s.actions}>
              <button type="button" className={s.button} onClick={() => void go()} disabled={busy} aria-busy={busy || undefined}>
                {busy ? "Opening…" : ended ? "Add a card to continue" : "Add a card"}
              </button>
              <Link className={s.quiet} href={"/dashboard" as Route}>
                {ended ? "Look around first" : "Later"}
              </Link>
            </div>
          ) : (
            <p className={s.note}>Only the owner of this workspace can add the card.</p>
          )}
          {error ? (
            <p className={`${s.note} ${s.error}`} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
