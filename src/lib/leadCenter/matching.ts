// Lead Center matching — builds the ranked candidate list for a platform lead.
// Plain server module; called from the cascade engine (guarded actions/cron).
//
// Hard filter: org opted in (leadOffersEnabled), geocoded (lat/lng), its
// canonical trades cover the detected trade, and — since 2026-10-03 — the lead
// lies within the shop's service radius (Organization.serviceRadiusMiles,
// default 50), measured pin to pin. A lead with no pin reaches nobody: there
// is no distance to keep a radius against. Until then nothing bounded the
// distance at all, and a Tucson lead was offered to a Missouri shop because
// the distance term (≈0 at 1,000 mi) only weighs 45% of the score.
// Score (all components 0–1):
//   total = 0.45·distance + 0.35·rating + 0.20·responsiveness
// The full breakdown is snapshotted per-candidate so the admin Lead Center can
// show WHY an org ranked where it did.
import { db } from "@/lib/db";
import { haversineMiles } from "@/lib/geo";
import { parseTradeTypes, orgCoversTrade, isTradeType, type TradeType } from "@/lib/tradeTypes";

export interface Candidate {
  orgId: string;
  orgName: string;
  score: number;
  distanceMi: number | null;
  distanceScore: number;
  ratingScore: number;
  respScore: number;
  // The raw review numbers behind ratingScore, for the admin to read as stars
  // (the smoothed 0–1 score alone reads as nothing). Hidden reviews included.
  ratingAvg: number | null;
  ratingCount: number;
  // true when distance came from the zip fallback (lead not geocoded) rather
  // than a real haversine measurement.
  fallback: boolean;
  /** The shop's service radius, miles. Absent on snapshots before 2026-10-03. */
  radiusMi?: number;
  /** Lead pin and shop pin within that radius. Only the admin's out-of-area
   *  list ever holds a false here; the cascade never ranks one. */
  inRadius?: boolean;
}

export interface PlatformLeadLike {
  detectedTrade: string | null;
  lat: number | null;
  lng: number | null;
  zip: string | null;
}

// ≈0.5 at 15mi, ≈0.1 at 50mi — "nearby" decays over a ~50-mile radius.
const DISTANCE_DECAY_MI = 21.6;
// Bayesian rating prior: a shop with no reviews scores as a 4.0 with weight 5.
const RATING_PRIOR_MEAN = 4.0;
const RATING_PRIOR_WEIGHT = 5;

function distanceScoreFor(
  lead: PlatformLeadLike,
  org: { lat: number; lng: number; address: string | null },
): { score: number; miles: number | null; fallback: boolean } {
  if (lead.lat != null && lead.lng != null) {
    const miles = haversineMiles({ lat: lead.lat, lng: lead.lng }, { lat: org.lat, lng: org.lng });
    return { score: Math.exp(-miles / DISTANCE_DECAY_MI), miles, fallback: false };
  }
  // Zip fallback: the org is always geocoded (hard filter) but its zip lives
  // inside the free-text address; the lead may only have a zip.
  const leadZip = lead.zip?.trim().slice(0, 5);
  const orgZip = extractZip(org.address);
  if (!leadZip || !orgZip) return { score: 0.5, miles: null, fallback: true };
  if (leadZip === orgZip) return { score: 1.0, miles: null, fallback: true };
  if (leadZip.slice(0, 3) === orgZip.slice(0, 3)) return { score: 0.7, miles: null, fallback: true };
  return { score: 0.4, miles: null, fallback: true };
}

function extractZip(address: string | null): string | null {
  const m = address?.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/);
  return m?.[1] ?? null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Everything ranking reads that does not depend on the lead: the shops that
 *  can take platform leads at all, their reviews and their offer history. One
 *  load serves any number of leads — the admin Lead Center ranks every waiting
 *  lead against it in one pass (2026-10-02). */
export interface RankingInputs {
  orgs: {
    id: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    tradeTypesJson: string | null;
    serviceRadiusMiles: number;
    isInternal: boolean;
    createdAt: Date;
  }[];
  ratingByOrg: Map<string, { _sum: { rating: number | null }; _count: { rating: number } }>;
  openByOrg: Map<string, number>;
  resolvedByOrg: Map<string, { status: string; createdAt: Date; respondedAt: Date | null }[]>;
}

export async function loadRankingInputs(): Promise<RankingInputs> {
  const orgs = await db.organization.findMany({
    where: { leadOffersEnabled: true, deletedAt: null, lat: { not: null }, lng: { not: null } },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
      tradeTypesJson: true,
      serviceRadiusMiles: true,
      isInternal: true,
      createdAt: true,
    },
  });
  // A custom-plan shop that did not buy Leads cannot open an offer (the page,
  // its actions and the pop-up all refuse — lib/customPageAccess), so it is
  // not a candidate either.
  const customIds = (
    await db.subscription.findMany({
      where: { organizationId: { in: orgs.map((o) => o.id) }, plan: { in: ["CUSTOM", "custom"] } },
      select: { organizationId: true },
    })
  ).map((r) => r.organizationId);
  const withoutLeads = new Set<string>();
  if (customIds.length) {
    const rows = await db.syncState.findMany({ where: { key: { in: customIds.map((id) => `orgPages:${id}`) } } });
    const has = new Map(rows.map((r) => [r.key.slice("orgPages:".length), r.cursor]));
    for (const id of customIds) {
      let pages: unknown = [];
      try {
        pages = JSON.parse(has.get(id) ?? "[]");
      } catch {
        pages = [];
      }
      if (!Array.isArray(pages) || !pages.includes("leads")) withoutLeads.add(id);
    }
  }
  if (withoutLeads.size) orgs.splice(0, orgs.length, ...orgs.filter((o) => !withoutLeads.has(o.id)));
  const ids = orgs.map((o) => o.id);
  if (!ids.length) {
    return { orgs, ratingByOrg: new Map(), openByOrg: new Map(), resolvedByOrg: new Map() };
  }

  const [ratingAgg, resolvedOffers, openOfferAgg] = await Promise.all([
    db.reviewRequest.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids }, rating: { not: null } },
      _sum: { rating: true },
      _count: { rating: true },
    }),
    // Test leads (PlatformLead.isTest) are rehearsals, not a shop's record.
    db.leadOffer.findMany({
      where: { organizationId: { in: ids }, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] }, platformLead: { isTest: false } },
      select: { organizationId: true, status: true, createdAt: true, respondedAt: true },
    }),
    db.leadOffer.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids }, status: "OFFERED", platformLead: { isTest: false } },
      _count: { _all: true },
    }),
  ]);

  const resolvedByOrg: RankingInputs["resolvedByOrg"] = new Map();
  for (const o of resolvedOffers) {
    const list = resolvedByOrg.get(o.organizationId) ?? [];
    list.push(o);
    resolvedByOrg.set(o.organizationId, list);
  }
  return {
    orgs,
    ratingByOrg: new Map(ratingAgg.map((r) => [r.organizationId, r])),
    openByOrg: new Map(openOfferAgg.map((r) => [r.organizationId, r._count._all])),
    resolvedByOrg,
  };
}

export async function buildRanking(lead: PlatformLeadLike): Promise<Candidate[]> {
  return rankWith(lead, await loadRankingInputs());
}

/** Miles from the lead's pin to the shop's, or null when either has none. */
export function leadToShopMiles(
  lead: { lat: number | null; lng: number | null },
  org: { lat: number | null; lng: number | null },
): number | null {
  if (lead.lat == null || lead.lng == null || org.lat == null || org.lng == null) return null;
  return haversineMiles({ lat: lead.lat, lng: lead.lng }, { lat: org.lat, lng: org.lng });
}

/** The service-radius rule, in one place: both pins, and within the shop's miles. */
export function withinServiceRadius(
  lead: { lat: number | null; lng: number | null },
  org: { lat: number | null; lng: number | null; serviceRadiusMiles: number },
): boolean {
  const miles = leadToShopMiles(lead, org);
  return miles != null && miles <= org.serviceRadiusMiles;
}

/**
 * The cascade's ranking for one lead, from inputs already loaded.
 *
 * `anyTrade` drops the trade filter and `anyDistance` the service radius, and
 * nothing else — same score, same tie breaks — for the admin's hand-send list,
 * where a shop outside the lead's trade or area is an exception a person may
 * still choose. Each candidate says whether it is in radius.
 */
export function rankWith(
  lead: PlatformLeadLike,
  inputs: RankingInputs,
  opts: { anyTrade?: boolean; anyDistance?: boolean } = {},
): Candidate[] {
  const detected: TradeType =
    lead.detectedTrade && isTradeType(lead.detectedTrade) ? lead.detectedTrade : "Other";
  // tradeTypesJson is a JSON-string column (SQLite) — filter in JS; org count
  // is small at this stage of the platform.
  const eligible = inputs.orgs.filter(
    (o) =>
      (opts.anyTrade || orgCoversTrade(parseTradeTypes(o.tradeTypesJson), detected)) &&
      (opts.anyDistance || withinServiceRadius(lead, o)),
  );
  if (!eligible.length) return [];
  const { ratingByOrg, openByOrg, resolvedByOrg } = inputs;

  const candidates = eligible.map((org) => {
    const dist = distanceScoreFor(lead, { lat: org.lat!, lng: org.lng!, address: org.address });

    const rating = ratingByOrg.get(org.id);
    const n = rating?._count.rating ?? 0;
    const sum = rating?._sum.rating ?? 0;
    const smoothed = (sum + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) / (n + RATING_PRIOR_WEIGHT);
    const ratingScore = (smoothed - 1) / 4;
    const ratingAvg = n > 0 ? Number((sum / n).toFixed(2)) : null;

    const resolved = resolvedByOrg.get(org.id) ?? [];
    let respScore = 0.5; // neutral prior — no offer history yet
    if (resolved.length > 0) {
      const accepted = resolved.filter((o) => o.status === "ACCEPTED").length;
      const acceptRate = (accepted + 1) / (resolved.length + 2); // Laplace smoothing
      const respondHours = resolved
        .filter((o) => o.respondedAt != null)
        .map((o) => (o.respondedAt!.getTime() - o.createdAt.getTime()) / 3_600_000);
      const med = median(respondHours);
      const speedScore = med == null ? 0.5 : Math.max(0, 1 - med / 24);
      respScore = 0.7 * acceptRate + 0.3 * speedScore;
    }

    const score = 0.45 * dist.score + 0.35 * ratingScore + 0.2 * respScore;
    return {
      candidate: {
        orgId: org.id,
        orgName: org.name,
        score: Number(score.toFixed(4)),
        distanceMi: dist.miles == null ? null : Number(dist.miles.toFixed(1)),
        distanceScore: Number(dist.score.toFixed(4)),
        ratingScore: Number(ratingScore.toFixed(4)),
        respScore: Number(respScore.toFixed(4)),
        ratingAvg,
        ratingCount: n,
        fallback: dist.fallback,
        radiusMi: org.serviceRadiusMiles,
        inRadius: withinServiceRadius(lead, org),
      } satisfies Candidate,
      openOffers: openByOrg.get(org.id) ?? 0,
      createdAt: org.createdAt,
    };
  });

  // Highest score first; near-ties break toward the less-loaded, then older org.
  candidates.sort((a, b) => {
    if (Math.abs(a.candidate.score - b.candidate.score) > 0.001) {
      return b.candidate.score - a.candidate.score;
    }
    if (a.openOffers !== b.openOffers) return a.openOffers - b.openOffers;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return candidates.map((c) => c.candidate);
}
