// THE CUSTOM PLAN'S PAGE GATE — the server half.
//
// A custom-plan org paid for the base workspace plus the add-on pages it
// ticked at signup (lib/customPlan). Until 2026-08-29 that selection was
// recorded (`orgPages:<orgId>` in SyncState, written by completePendingSignup)
// and then read by nothing: an org that bought two pages could open all nine.
//
// This module is the one DB read. What the selection MEANS — which hrefs are
// blocked, whether a path falls under one — is customPlan's pure helpers, so
// the client-side nav filters and this gate can never disagree.
//
// WHO ENFORCES. Both dashboard layouts (src/app/dashboard/layout.tsx for the
// blueprint tree, src/app/(dashboard)/layout.tsx for the classic tree) call
// getBlockedCustomPages and redirect a blocked path to /dashboard — the same
// fail-closed, DB-backed, x-pathname-driven arrangement the role gate uses one
// line above. The middleware deliberately takes no part: it is edge-runtime
// and fail-open, and a plan read needs the DB.
//
// WHO DRAWS. The layouts hand the same list to the nav provider, and every
// chrome filter (sidebar, drawer, palette, estimator picker, classic sidebar,
// tab bar) drops what it names. The nav is a courtesy; the layouts are the
// boundary.

import { db } from "@/lib/db";
import { blockedCustomHrefs, normalizeCustomPages } from "@/lib/customPlan";

/**
 * The hrefs this org may NOT open, or null when the org is not on the custom
 * plan — null, not [], so callers can tell "unrestricted" from "bought
 * everything" without a second read.
 *
 * A missing or unreadable selection row reads as ZERO pages bought — which is
 * exactly what completePendingSignup writes for a custom signup with no
 * add-ons, so an absent row and an empty purchase are the same state on
 * purpose. The base workspace is never in the blocked list, so a custom org is
 * never locked out of what every custom plan includes.
 */
export async function getBlockedCustomPages(
  organizationId: string | null | undefined,
): Promise<string[] | null> {
  if (!organizationId) return null;
  const sub = await db.subscription
    .findUnique({ where: { organizationId }, select: { plan: true } })
    .catch(() => null);
  if ((sub?.plan ?? "").toUpperCase() !== "CUSTOM") return null;

  const row = await db.syncState
    .findUnique({ where: { key: `orgPages:${organizationId}` } })
    .catch(() => null);
  if (!row) return blockedCustomHrefs([]);
  try {
    return blockedCustomHrefs(normalizeCustomPages(JSON.parse(row.cursor) as string[]));
  } catch {
    return blockedCustomHrefs([]);
  }
}
