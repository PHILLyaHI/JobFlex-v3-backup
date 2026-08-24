// Admin Lead Center — Blueprint edition. Every number on the sheet is read
// here: the latest platform leads with their offer history and ranking
// snapshot, every organization's eligibility, and the 30-day routing stats
// (intake by trade, accept rate, median accept time, the daily series and the
// geocoded points the site plan projects). No fixtures.
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseTradeTypes } from "@/lib/tradeTypes";
import {
  AdminLeadCenterContent,
  type PlatformLeadDTO,
  type OrgPickDTO,
  type RankEntry,
  type StatsDTO,
} from "@/components/v3/admin-lead-center/lead-center-content";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 34;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function AdminLeadCenterPage() {
  await requirePlatformAdmin();

  const now = new Date();
  const today = startOfDay(now);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since60 = new Date(now.getTime() - 60 * DAY_MS);
  const seriesStart = startOfDay(new Date(now.getTime() - (SERIES_DAYS - 1) * DAY_MS));

  const [platformLeads, orgs, recent, resolvedOffers, routedPrior, openOffers] = await Promise.all([
    db.platformLead.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        offers: {
          orderBy: { createdAt: "asc" },
          include: { organization: { select: { name: true } } },
        },
      },
    }),
    db.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, tradeTypesJson: true, lat: true, lng: true, leadOffersEnabled: true },
    }),
    // The stats window — wider than the ledger's 200-row cap on a busy platform.
    db.platformLead.findMany({
      where: { createdAt: { gte: seriesStart < since30 ? seriesStart : since30 } },
      select: {
        id: true,
        createdAt: true,
        matchedAt: true,
        detectedTrade: true,
        status: true,
        lat: true,
        lng: true,
        city: true,
      },
    }),
    db.leadOffer.findMany({
      where: { createdAt: { gte: since30 }, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] } },
      select: { status: true, attempt: true, createdAt: true, respondedAt: true },
    }),
    db.platformLead.count({ where: { matchedAt: { gte: since60, lt: since30 } } }),
    db.leadOffer.findMany({
      where: { status: "OFFERED", expiresAt: { gt: now } },
      select: { expiresAt: true },
    }),
  ]);

  // ── ledger DTO ──────────────────────────────────────────────────────────
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const unresolved = [
    ...new Set(platformLeads.map((p) => p.matchedOrgId).filter((v): v is string => !!v && !orgName.has(v))),
  ];
  if (unresolved.length) {
    const extra = await db.organization.findMany({
      where: { id: { in: unresolved } },
      select: { id: true, name: true },
    });
    for (const o of extra) orgName.set(o.id, o.name);
  }

  const leads: PlatformLeadDTO[] = platformLeads.map((p) => {
    let ranking: RankEntry[] = [];
    try {
      ranking = JSON.parse(p.rankingJson ?? "[]");
    } catch {
      ranking = [];
    }
    const active = p.offers.find((o) => o.status === "OFFERED" && o.expiresAt > now);
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      address: p.address,
      city: p.city,
      state: p.state,
      zip: p.zip,
      projectType: p.projectType,
      description: p.description,
      detectedTrade: p.detectedTrade,
      aiConfidence: p.aiConfidence,
      geocoded: p.lat != null && p.lng != null,
      status: p.status,
      attemptCount: p.attemptCount,
      queueReason: p.queueReason,
      matchedOrgName: p.matchedOrgId ? (orgName.get(p.matchedOrgId) ?? null) : null,
      matchedAt: p.matchedAt ? p.matchedAt.toISOString() : null,
      manuallyAssigned: p.assignedByAdminId != null,
      createdAt: p.createdAt.toISOString(),
      ranking,
      offers: p.offers.map((o) => ({
        id: o.id,
        orgName: o.organization.name,
        attempt: o.attempt,
        status: o.status,
        score: o.score,
        expiresAt: o.expiresAt.toISOString(),
        respondedAt: o.respondedAt ? o.respondedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      })),
      activeOffer: active
        ? {
            orgName: active.organization.name,
            attempt: active.attempt,
            expiresAt: active.expiresAt.toISOString(),
            score: active.score,
          }
        : null,
    };
  });

  const orgPicks: OrgPickDTO[] = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    trades: parseTradeTypes(o.tradeTypesJson),
    geocoded: o.lat != null && o.lng != null,
    offersEnabled: o.leadOffersEnabled,
  }));

  // ── stats ───────────────────────────────────────────────────────────────
  const last30 = recent.filter((p) => p.createdAt >= since30);
  const todayRows = recent.filter((p) => p.createdAt >= today);

  const countBy = (rows: typeof recent) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.detectedTrade ?? "Unclassified";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const todayByTrade = countBy(todayRows)
    .slice(0, 4)
    .map(([trade, n]) => ({ trade, n }));
  const dist = countBy(last30).slice(0, 6);
  const distMax = dist[0]?.[1] ?? 1;
  const tradeDist = dist.map(([trade, n]) => ({ trade, n, pct: Math.round((n / distMax) * 100) }));

  const accepted = resolvedOffers.filter((o) => o.status === "ACCEPTED");
  const acceptRatePct = resolvedOffers.length ? (accepted.length / resolvedOffers.length) * 100 : null;
  const firstOfferPct = accepted.length
    ? (accepted.filter((o) => o.attempt === 1).length / accepted.length) * 100
    : null;
  const medianAcceptMin = median(
    accepted
      .filter((o) => o.respondedAt)
      .map((o) => (o.respondedAt!.getTime() - o.createdAt.getTime()) / 60_000),
  );
  const routed30 = recent.filter((p) => p.matchedAt && p.matchedAt >= since30).length;
  const routedTotal = await db.platformLead.count({ where: { status: "MATCHED" } });
  const routedDeltaPct =
    routedPrior > 0 ? ((routed30 - routedPrior) / routedPrior) * 100 : routed30 > 0 ? null : null;

  const series: StatsDTO["series"] = [];
  for (let i = 0; i < SERIES_DAYS; i++) {
    const d = new Date(seriesStart.getTime() + i * DAY_MS);
    const key = dayKey(d);
    series.push({
      day: d.toISOString(),
      leads: recent.filter((p) => dayKey(p.createdAt) === key).length,
      matched: recent.filter((p) => p.matchedAt && dayKey(p.matchedAt) === key).length,
    });
  }

  // ── site plan projection ────────────────────────────────────────────────
  const pinned = last30.filter((p) => p.lat != null && p.lng != null) as (typeof last30[number] & {
    lat: number;
    lng: number;
  })[];
  let mapPoints: StatsDTO["mapPoints"] = [];
  let mapCities: StatsDTO["mapCities"] = [];
  if (pinned.length) {
    const lats = pinned.map((p) => p.lat);
    const lngs = pinned.map((p) => p.lng);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    // A single point (or a tight cluster) still needs a frame to sit in.
    if (maxLat - minLat < 0.02) {
      minLat -= 0.01;
      maxLat += 0.01;
    }
    if (maxLng - minLng < 0.02) {
      minLng -= 0.01;
      maxLng += 0.01;
    }
    const PAD = 14; // percent of frame kept clear on every side
    const px = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng)) * (100 - 2 * PAD);
    const py = (lat: number) => PAD + ((maxLat - lat) / (maxLat - minLat)) * (100 - 2 * PAD);
    mapPoints = pinned.map((p) => ({
      id: p.id,
      x: Number(px(p.lng).toFixed(2)),
      y: Number(py(p.lat).toFixed(2)),
      status: p.status,
    }));
    const cityAgg = new Map<string, { n: number; x: number; y: number }>();
    for (const p of pinned) {
      if (!p.city) continue;
      const cur = cityAgg.get(p.city) ?? { n: 0, x: 0, y: 0 };
      cur.n += 1;
      cur.x += px(p.lng);
      cur.y += py(p.lat);
      cityAgg.set(p.city, cur);
    }
    mapCities = [...cityAgg.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 3)
      .map(([name, c]) => ({ name, x: Number((c.x / c.n).toFixed(2)), y: Number((c.y / c.n).toFixed(2)) }));
  }

  const stats: StatsDTO = {
    todayCreated: todayRows.length,
    todayMatched: recent.filter((p) => p.matchedAt && p.matchedAt >= today).length,
    todayByTrade,
    tradeDist,
    acceptRatePct,
    firstOfferPct,
    medianAcceptMin,
    routedTotal,
    routedDeltaPct,
    series,
    openOffers: openOffers.length,
    expiringSoon: openOffers.filter((o) => o.expiresAt.getTime() - now.getTime() < 12 * 60 * 60 * 1000).length,
    queue: platformLeads.filter((p) => p.status === "MANUAL_QUEUE").length,
    mapPoints,
    mapCities,
    ungeocoded: last30.length - pinned.length,
  };

  return <AdminLeadCenterContent leads={leads} orgs={orgPicks} stats={stats} />;
}
