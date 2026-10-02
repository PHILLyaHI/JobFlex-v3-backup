// /dashboard/trial — the card-less trial's own page (owner, 2026-10-01;
// lib/cardlessTrial). The ribbon over every dashboard page links here once
// the trial has ended: "Add a card to continue", with the plan and its price.
// It is also where Stripe Checkout returns (?card=added&session_id=…): the
// card is attached (or the plan restarted) here, before the page draws, so the
// workspace is unlocked on this very load — the webhook does the same and is
// only a backstop. One composition for both widths: a single framed sheet
// whose actions go full width at ≤768px (trial-card.module.css).
import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireOrg, isOwnerRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { finishCardCheckout, trialView } from "@/lib/cardlessTrial";
import { TRIAL_ENDED_MESSAGE } from "@/lib/trialLock";
import { TrialSheet } from "@/components/v3/trial-card/trial-card";
import { isTrialCapKey } from "@/lib/trialCaps";
import { trialCapUsage } from "@/lib/trialMeter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Free trial",
  description: "Add a card to keep your workspace after the free trial.",
};

export default async function TrialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let organizationId: string;
  let role: string;
  try {
    ({ organizationId, role } = await requireOrg());
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof NoOrgError) redirect("/auth/login?next=%2Fdashboard%2Ftrial" as Route);
    throw err;
  }
  const sp = await searchParams;
  const card = typeof sp.card === "string" ? sp.card : null;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  let notice: { tone: "ok" | "error" | "plain"; text: string } | null = null;
  if (card === "added" && sessionId) {
    const done = await finishCardCheckout(organizationId, sessionId).catch((err) => {
      console.error("[trial] finishing the card checkout failed:", err);
      return { ok: false as const, error: "We couldn't confirm the card yet. Refresh in a minute." };
    });
    notice = done.ok
      ? { tone: "ok", text: done.purpose === "trial-restart" ? "Card added — your plan is active again." : "Card added — your plan starts when the trial ends." }
      : { tone: "error", text: done.error };
  } else if (card === "cancelled") {
    notice = { tone: "plain", text: "No card was added." };
  } else if (sp.locked === "1") {
    // A write was refused (lib/trialLock sends the browser here).
    notice = { tone: "error", text: `That change wasn't saved. ${TRIAL_ENDED_MESSAGE}` };
  }

  const view = await trialView(organizationId);
  // Nothing to show (a paid signup, a restarted plan, a free account): the
  // plan lives on Subscription. A restart lands here once with its notice.
  if (!view) {
    if (notice?.tone === "ok") redirect("/dashboard?card=added" as Route);
    redirect("/dashboard/subscription" as Route);
  }
  // The card-less trial's own ceilings, while they apply (no card, not ended):
  // lib/trialCaps. A refused paid action sends the browser here with ?cap=.
  const caps = view.kind === "trialing" && !view.hasCard ? await trialCapUsage(organizationId) : null;
  const capHit = isTrialCapKey(sp.cap) ? sp.cap : null;
  return <TrialSheet view={view} isOwner={isOwnerRole(role)} notice={notice} caps={caps} capHit={capHit} />;
}
