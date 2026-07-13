// Lead Center matching — builds the ranked candidate list for a platform lead.
// Plain server module; called from the cascade engine (guarded actions/cron).
//
// Hard filter: org opted in (leadOffersEnabled), geocoded (lat/lng), and its
// canonical trades cover the detected trade. Score (all components 0–1):
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
  // true when distance came from the zip fallback (lead not geocoded) rather
  // than a real haversine measurement.
  fallback: boolean;
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

export async function buildRanking(lead: PlatformLeadLike): Promise<Candidate[]> {
  const detected: TradeType =
    lead.detectedTrade && isTradeType(lead.detectedTrade) ? lead.detectedTrade : "Other";

  const orgs = await db.organization.findMany({
    where: { leadOffersEnabled: true, lat: { not: null }, lng: { not: null } },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
      tradeTypesJson: true,
      createdAt: true,
    },
  });
  // tradeTypesJson is a JSON-string column (SQLite) — filter in JS; org count
  // is small at this stage of the platform.
  const eligible = orgs.filter((o) => orgCoversTrade(parseTradeTypes(o.tradeTypesJson), detected));
  if (!eligible.length) return [];
  const ids = eligible.map((o) => o.id);

  const [ratingAgg, resolvedOffers, openOfferAgg] = await Promise.all([
    db.reviewRequest.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids }, rating: { not: null } },
      _sum: { rating: true },
      _count: { rating: true },
    }),
    db.leadOffer.findMany({
      where: { organizationId: { in: ids }, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] } },
      select: { organizationId: true, status: true, createdAt: true, respondedAt: true },
    }),
    db.leadOffer.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids }, status: "OFFERED" },
      _count: { _all: true },
    }),
  ]);

  const ratingByOrg = new Map(ratingAgg.map((r) => [r.organizationId, r]));
  const openByOrg = new Map(openOfferAgg.map((r) => [r.organizationId, r._count._all]));
  const resolvedByOrg = new Map<string, typeof resolvedOffers>();
  for (const o of resolvedOffers) {
    const list = resolvedByOrg.get(o.organizationId) ?? [];
    list.push(o);
    resolvedByOrg.set(o.organizationId, list);
  }

  const candidates = eligible.map((org) => {
    const dist = distanceScoreFor(lead, { lat: org.lat!, lng: org.lng!, address: org.address });

    const rating = ratingByOrg.get(org.id);
    const n = rating?._count.rating ?? 0;
    const sum = rating?._sum.rating ?? 0;
    const smoothed = (sum + RATING_PRIOR_MEAN * RATING_PRIOR_WEIGHT) / (n + RATING_PRIOR_WEIGHT);
    const ratingScore = (smoothed - 1) / 4;

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
        fallback: dist.fallback,
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
