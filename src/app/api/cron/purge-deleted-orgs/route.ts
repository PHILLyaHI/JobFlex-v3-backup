import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cronAuth";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { markSubscriptionCanceled } from "@/lib/stripeSync";
import { SubscriptionStatus } from "@/lib/prismaEnums";

export const runtime = "nodejs";

// Soft-deleted organizations (Settings → Danger zone) are hard-deleted 30
// days later — one `organization.delete`, every relation cascades. An org
// whose Stripe subscription is still live is NOT purged: the cancel is
// retried and the row logged, so the money side never silently disappears.
const GRACE_DAYS = 30;
const LIVE = [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE];

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.organization.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, name: true, subscription: { select: { status: true, externalSubId: true } } },
    take: 50,
  });

  let purged = 0;
  let blocked = 0;
  for (const org of due) {
    const sub = org.subscription;
    if (sub?.externalSubId && LIVE.includes(sub.status as (typeof LIVE)[number])) {
      // Retry the cancel; purge next run once the webhook/reconcile marks it.
      try {
        if (isStripeEnabled()) {
          const canceled = await getStripe().subscriptions.cancel(sub.externalSubId);
          await markSubscriptionCanceled(canceled);
        }
      } catch (err) {
        console.error("[cron/purge-deleted-orgs] blocked — stripe cancel failed", org.id, err);
      }
      blocked += 1;
      continue;
    }
    try {
      await db.organization.delete({ where: { id: org.id } });
      purged += 1;
    } catch (err) {
      console.error("[cron/purge-deleted-orgs] delete failed", org.id, err);
    }
  }
  return NextResponse.json({ due: due.length, purged, blocked });
}
