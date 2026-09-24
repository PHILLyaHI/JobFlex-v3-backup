// WHAT A SIGNED-IN LAYOUT MOUNTS FOR THE TRIAL WATCH (2026-09-24).
//
// Two reads, one component, both signed-in layouts (dashboard and the
// handheld twins): the page-view beacon while the company is in its first
// WATCH_DAYS, and the watermark while it has not paid — a subscription that
// is not ACTIVE or PAST_DUE. A failed read costs both, never the page.

import { db } from "@/lib/db";
import { WATCH_DAYS, watermarkText } from "@/lib/trialWatch";
import { PageViewBeacon } from "./page-view-beacon";
import { TrialWatermark } from "./trial-watermark";

/** The two reads, outside the component so the clock is read in plain code. */
async function readTrialWatch(organizationId: string, email: string | null | undefined): Promise<{ watch: boolean; mark: string | null }> {
  try {
    const [org, sub] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true, createdAt: true } }),
      db.subscription.findUnique({ where: { organizationId }, select: { status: true } }),
    ]);
    if (!org) return { watch: false, mark: null };
    const watch = Date.now() - org.createdAt.getTime() < WATCH_DAYS * 86_400_000;
    const paid = sub?.status === "ACTIVE" || sub?.status === "PAST_DUE";
    return { watch, mark: paid ? null : watermarkText({ status: sub?.status ?? "FREE", org: org.name, email: email ?? "" }) };
  } catch {
    /* a failed read costs the beacon and the watermark, never the page */
    return { watch: false, mark: null };
  }
}

export async function TrialWatchMount({ organizationId, email }: { organizationId: string; email: string | null | undefined }) {
  const { watch, mark } = await readTrialWatch(organizationId, email);
  return (
    <>
      {watch && <PageViewBeacon />}
      {mark && <TrialWatermark text={mark} />}
    </>
  );
}
