// Whether a shop can receive platform leads at all — the one place that
// answers it, and the one place that sets the pin.
//
// WHY THIS EXISTS. `buildRanking` (./matching) hard-filters on
// `lat`/`lng` being present: an org with no geocode is invisible to routing,
// no matter how complete the rest of its profile looks. Until 2026-09-17 only
// the legacy free-signup action (`registerAccount`) geocoded. The live paid
// path — `completePendingSignup` — never did, so every shop created through
// checkout was born un-routable while its own Company page showed
// "Matching on". Eighteen of eighteen organizations in the local database had
// null coordinates.
//
// The fix is this module: ONE geocode-and-record routine that the signup, the
// Company profile save and the backfill route all call, so the three cannot
// drift again.
//
// WHERE THE REASON LIVES. A shop gated off needs to be told why, and the
// admin needs to read it back. That is one short string per org, which is
// exactly the shape `SyncState` already stores for the platform's other
// switches (see ./routingMode for the same call). Using it keeps this a code
// change rather than a migration.
import { db } from "@/lib/db";
import { geocodeAddress } from "@/lib/maps";

/** Why this org is not taking platform leads. Free text, but these prefixes
 *  are the vocabulary the Company banner and the admin queue read. */
export type LeadGateReason = string;

const gateKey = (orgId: string) => `orgLeadGate:${orgId}`;

/** Record why a shop is out of the running. Best-effort: a store that cannot
 *  be written must not fail the signup that is already committed. */
export async function recordLeadGate(orgId: string, reason: LeadGateReason): Promise<void> {
  try {
    await db.syncState.upsert({
      where: { key: gateKey(orgId) },
      update: { cursor: reason.slice(0, 250) },
      create: { key: gateKey(orgId), cursor: reason.slice(0, 250) },
    });
  } catch (err) {
    console.warn("[lead-gate] could not record reason for", orgId, err);
  }
}

/** The recorded reason, or null when the shop was never gated. */
export async function readLeadGate(orgId: string): Promise<LeadGateReason | null> {
  try {
    const row = await db.syncState.findUnique({ where: { key: gateKey(orgId) } });
    return row?.cursor || null;
  } catch {
    return null;
  }
}

export async function clearLeadGate(orgId: string): Promise<void> {
  try {
    await db.syncState.delete({ where: { key: gateKey(orgId) } });
  } catch {
    /* nothing recorded — that is the state we wanted */
  }
}

export interface GeocodeOrgResult {
  ok: boolean;
  lat: number | null;
  lng: number | null;
  /** Set when ok is false: why the pin could not be placed. */
  reason: LeadGateReason | null;
}

/**
 * Geocode an org's address and write the pin.
 *
 * `gateOnFailure` is the difference between the two callers:
 *   · signup passes true  — a shop that cannot be placed is created with lead
 *     offers OFF and the reason recorded, so it is never told it is matching
 *     when it is not;
 *   · a profile save passes false — the owner is looking at the toggle they
 *     set themselves, and flipping it under them would be the page arguing
 *     with the person using it. The reason is still recorded, and the banner
 *     (components/dashboard/CompleteLeadProfileBanner) is what surfaces it.
 *
 * Never throws: every caller treats routing eligibility as best-effort work
 * that must not roll back the write it follows.
 */
export async function geocodeOrgAddress(
  orgId: string,
  address: string | null | undefined,
  opts: { gateOnFailure: boolean },
): Promise<GeocodeOrgResult> {
  const line = address?.trim();
  if (!line) {
    // The pin goes with the address it was derived from: leaving a stale one
    // behind would keep routing leads to a location the shop no longer claims.
    const reason = "NO_ADDRESS: no business address on file";
    await db.organization
      .update({ where: { id: orgId }, data: { lat: null, lng: null, geocodedAt: null } })
      .catch(() => {});
    await gate(orgId, reason, opts.gateOnFailure);
    return { ok: false, lat: null, lng: null, reason };
  }

  let geo: { lat: number; lng: number } | null = null;
  try {
    geo = await geocodeAddress({ address: line });
  } catch (err) {
    const reason = `GEOCODE_ERROR: ${err instanceof Error ? err.message : "lookup failed"}`;
    // The address stays; only the pin is missing, so lat/lng are left ALONE on
    // an error (a transient Maps failure must not erase a good pin). A miss —
    // Maps answering "no such place" — is different, and handled below.
    await gate(orgId, reason, opts.gateOnFailure);
    return { ok: false, lat: null, lng: null, reason };
  }

  if (!geo) {
    const reason = "GEOCODE_MISS: the address did not resolve to a location";
    await db.organization
      .update({ where: { id: orgId }, data: { lat: null, lng: null, geocodedAt: null } })
      .catch(() => {});
    await gate(orgId, reason, opts.gateOnFailure);
    return { ok: false, lat: null, lng: null, reason };
  }

  await db.organization.update({
    where: { id: orgId },
    data: { lat: geo.lat, lng: geo.lng, geocodedAt: new Date() },
  });
  await clearLeadGate(orgId);
  return { ok: true, lat: geo.lat, lng: geo.lng, reason: null };
}

async function gate(orgId: string, reason: string, off: boolean): Promise<void> {
  await recordLeadGate(orgId, reason);
  if (!off) return;
  await db.organization
    .update({ where: { id: orgId }, data: { leadOffersEnabled: false } })
    .catch((err) => console.warn("[lead-gate] could not pause lead offers for", orgId, err));
}

/** Is this org actually routable right now? The same three conditions
 *  `buildRanking` applies, answered for one org so the UI can say so. */
export function isRoutable(org: {
  lat: number | null;
  lng: number | null;
  leadOffersEnabled: boolean;
  tradeTypes: string[];
}): boolean {
  return org.leadOffersEnabled && org.lat != null && org.lng != null && org.tradeTypes.length > 0;
}
