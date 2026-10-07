import "server-only";
// WHY AN ACCOUNT LAPSED (owner, 2026-10-05: "what happened with the lapsed
// user — why canceled?"). For each lapsed signup in the list, one sentence
// from what is on record, the strongest source first:
//   · Stripe's own word on the subscription — cancellation_details.reason
//     (canceled on request, a failed payment, a dispute), the customer's
//     feedback and comment from the billing portal, or `incomplete_expired`
//     (the first payment was never completed);
//   · the account's billing log — the owner pressing Cancel on their
//     subscription page (actions/billing, an ActivityEvent);
//   · the mirror's status — trial ended, payment failed, expired.
// Stripe is asked only for the lapsed rows of the list, once per ten minutes
// per subscription; when it cannot be reached the sentence says what the app
// itself knows.
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";

export type LapseInput = { orgId: string; status: string; canceledAt: Date | null; externalSubId: string | null };
export type LapseReason = { at: string | null; reason: string; source: "stripe" | "log" | "record" };

const FEEDBACK: Record<string, string> = {
  too_expensive: "too expensive",
  missing_features: "missing features",
  switched_service: "switched to another service",
  unused: "not using it",
  customer_service: "customer service",
  too_complex: "too complicated",
  low_quality: "quality",
  other: "other",
};

const TTL_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __jfLapseCache?: Map<string, { at: number; sub: Stripe.Subscription | null }> };
const cache = (g.__jfLapseCache ??= new Map());

async function stripeSub(id: string): Promise<Stripe.Subscription | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sub;
  let sub: Stripe.Subscription | null = null;
  try {
    const { stripe } = await getStripeClient();
    sub = await stripe.subscriptions.retrieve(id);
  } catch {
    sub = null;
  }
  cache.set(id, { at: Date.now(), sub });
  return sub;
}

/** The sentence for one subscription Stripe answered for; null when Stripe said nothing useful. */
export function stripeLapseWords(sub: Stripe.Subscription, ownerCanceled: boolean): string | null {
  const d = sub.cancellation_details;
  const feedback = d?.feedback ? FEEDBACK[d.feedback] ?? d.feedback : "";
  const comment = (d?.comment ?? "").trim().slice(0, 160);
  const said = [feedback && `reason given: ${feedback}`, comment && `“${comment}”`].filter(Boolean).join(" · ");
  const tail = said ? ` — ${said}` : "";
  if (sub.status === "incomplete_expired") return `The first payment was never completed, so Stripe closed the subscription${tail}.`;
  switch (d?.reason) {
    case "payment_failed": return `Payments failed, so Stripe canceled the subscription${tail}.`;
    case "payment_disputed": return `A payment was disputed, so Stripe canceled the subscription${tail}.`;
    case "cancellation_requested":
      return ownerCanceled ? `The owner canceled it from their Billing page${tail}.` : `It was canceled on request — in the customer's billing portal, the Stripe dashboard or the admin console${tail}.`;
    default:
      return said ? `Canceled${tail}.` : null;
  }
}

export async function lapseReasons(rows: readonly LapseInput[]): Promise<Map<string, LapseReason>> {
  const out = new Map<string, LapseReason>();
  if (!rows.length) return out;
  // The owner's own Cancel, from the billing log.
  const owned = new Set<string>();
  try {
    const events = await db.activityEvent.findMany({
      where: { organizationId: { in: rows.map((r) => r.orgId) }, summary: { contains: "subscription set to cancel" } },
      select: { organizationId: true },
    });
    for (const e of events) owned.add(e.organizationId);
  } catch {
    /* no log, no sentence from it */
  }
  const stripeOn = isStripeEnabled();
  await Promise.all(rows.map(async (r) => {
    const at = r.canceledAt ? r.canceledAt.toISOString() : null;
    const status = r.status.toUpperCase();
    if (stripeOn && r.externalSubId && status !== "TRIAL_ENDED") {
      const sub = await stripeSub(r.externalSubId);
      const words = sub ? stripeLapseWords(sub, owned.has(r.orgId)) : null;
      if (words) {
        const when = sub?.canceled_at ?? sub?.ended_at ?? null;
        out.set(r.orgId, { at: when ? new Date(when * 1000).toISOString() : at, reason: words, source: "stripe" });
        return;
      }
    }
    if (owned.has(r.orgId)) {
      out.set(r.orgId, { at, reason: "The owner canceled it from their Billing page.", source: "log" });
      return;
    }
    const reason =
      status === "TRIAL_ENDED" ? "The trial ended and they did not start paying."
      : status === "PAST_DUE" ? "A payment failed and has not been made up yet."
      : status === "UNPAID" ? "Stripe stopped retrying a failed payment; the plan is closed until it is paid."
      : status === "EXPIRED" ? "The plan expired."
      : "Canceled — no reason on record.";
    out.set(r.orgId, { at, reason, source: "record" });
  }));
  return out;
}
