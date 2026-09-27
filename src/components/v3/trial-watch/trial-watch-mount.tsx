// WHAT A SIGNED-IN LAYOUT MOUNTS FOR THE TRIAL WATCH (2026-09-24).
//
// Both signed-in layouts retain the page-view beacon while the company is
// in its first WATCH_DAYS. The diagonal trial watermark is no longer mounted.

import { db } from "@/lib/db";
import { WATCH_DAYS, watermarkText } from "@/lib/trialWatch";
import { PageViewBeacon } from "./page-view-beacon";

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
  const { watch } = await readTrialWatch(organizationId, email);
  return watch ? <PageViewBeacon /> : null;
}
