import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cronAuth";
import { isMapsEnabled } from "@/lib/maps";
import {
  geocodeOrgAddress,
  readLeadGate,
  clearLeadGate,
} from "@/lib/leadCenter/eligibility";

export const runtime = "nodejs";
// One Maps call per org, paced — a large estate can outrun the default budget.
export const maxDuration = 300;

// BACKFILL: give every org with an address a Lead Center pin.
//
// `completePendingSignup` never geocoded (fixed 2026-09-17), so every shop
// created through checkout carries a null lat/lng and is invisible to
// `buildRanking`'s hard filter. Eighteen of eighteen organizations in the local
// database were in that state. The signup fix only helps shops created from now
// on; this route is how the ones already on the books are repaired.
//
// NOT on the vercel.json cron schedule, deliberately: it is a repair to be run
// deliberately and watched, not a thing that quietly re-runs every night. Same
// CRON_SECRET guard as the scheduled routes, which fails CLOSED in production.
//
//   curl -H "x-cron-key: $CRON_SECRET" "https://<host>/api/cron/geocode-orgs?limit=25"
//   …&dryRun=1   lists what WOULD be geocoded and calls Maps not once.
//
// Pacing: one address at a time with a gap between calls. Maps would take them
// far faster; the gap is there so a 500-org estate cannot turn one careless
// call into a bill or a quota wall, and so a run can be watched in the log as
// it goes.
const GAP_MS = 250;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isMapsEnabled()) {
    return NextResponse.json(
      { error: "Maps is not configured — set GOOGLE_MAPS_API_KEY." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  // Every live org that HAS an address and has no pin. Ordered oldest first so
  // repeated runs chew through the backlog in a stable order.
  const where: Prisma.OrganizationWhereInput = {
    deletedAt: null,
    address: { not: null },
    OR: [{ lat: null }, { lng: null }],
  };

  const [candidates, remainingBefore] = await Promise.all([
    db.organization.findMany({
      where,
      select: { id: true, name: true, address: true, leadOffersEnabled: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
    db.organization.count({ where }),
  ]);

  // An address column that is present but blank is not an address.
  const targets = candidates.filter((o) => (o.address ?? "").trim().length > 0);
  const blank = candidates.length - targets.length;

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      remaining: remainingBefore,
      wouldGeocode: targets.map((o) => ({ id: o.id, name: o.name, address: o.address })),
      skippedBlankAddress: blank,
    });
  }

  const results: {
    id: string;
    name: string;
    ok: boolean;
    reason: string | null;
    reEnabled: boolean;
  }[] = [];

  for (const [i, org] of targets.entries()) {
    if (i > 0) await sleep(GAP_MS);

    // Read the gate BEFORE the geocode: a success clears it, and afterwards
    // there is no way to tell whether the shop was switched off by the signup
    // gate or by the owner. Only the first of those may be switched back on —
    // re-enabling a shop that paused itself would be this route overruling a
    // decision it knows nothing about.
    const systemGated = !org.leadOffersEnabled && (await readLeadGate(org.id)) !== null;

    let res;
    try {
      res = await geocodeOrgAddress(org.id, org.address, { gateOnFailure: false });
    } catch (err) {
      // geocodeOrgAddress does not throw, but one bad row must not end the run.
      const reason = `UNEXPECTED: ${err instanceof Error ? err.message : "failed"}`;
      console.error(`[geocode-orgs] ${org.id} ${org.name}: ${reason}`);
      results.push({ id: org.id, name: org.name, ok: false, reason, reEnabled: false });
      continue;
    }

    let reEnabled = false;
    if (res.ok && systemGated) {
      await db.organization
        .update({ where: { id: org.id }, data: { leadOffersEnabled: true } })
        .then(() => {
          reEnabled = true;
        })
        .catch((err) => console.error(`[geocode-orgs] ${org.id}: re-enable failed`, err));
      await clearLeadGate(org.id);
    }

    if (res.ok) {
      console.info(
        `[geocode-orgs] ok   ${org.id} ${org.name} → ${res.lat},${res.lng}${reEnabled ? " (offers re-enabled)" : ""}`,
      );
    } else {
      console.error(`[geocode-orgs] fail ${org.id} ${org.name}: ${res.reason}`);
    }
    results.push({ id: org.id, name: org.name, ok: res.ok, reason: res.reason, reEnabled });
  }

  const geocoded = results.filter((r) => r.ok).length;
  const failed = results.length - geocoded;
  console.info(
    `[geocode-orgs] run complete: ${geocoded} geocoded, ${failed} failed, ${Math.max(0, remainingBefore - geocoded)} still without a pin`,
  );

  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    geocoded,
    failed,
    reEnabled: results.filter((r) => r.reEnabled).length,
    skippedBlankAddress: blank,
    remaining: Math.max(0, remainingBefore - geocoded),
    results,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
