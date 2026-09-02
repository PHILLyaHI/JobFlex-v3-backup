// Admin Lead Center — Blueprint edition. Every number on the sheet is read
// here: the latest platform leads with their offer history and ranking
// snapshot, every organization's eligibility, and the 30-day routing stats
// (intake by trade, accept rate, median accept time, the daily series and the
// geocoded points the site plan projects). No fixtures.
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseTradeTypes } from "@/lib/tradeTypes";
import { getRoutingMode } from "@/lib/leadCenter/routingMode";
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
  const seriesStart = startOfDay(new Date(now.getTime() - (SERIES_DAYS - 1) * DAY_MS));

  const [platformLeads, orgs, recent, resolvedOffers, openOffers] = await Promise.all([
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
      select: {
        id: true,
        name: true,
        tradeTypesJson: true,
        otherTrade: true,
        lat: true,
        lng: true,
        address: true,
        phone: true,
        billingEmail: true,
        leadOffersEnabled: true,
        createdAt: true,
      },
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

  // Did the shop the lead was routed to actually take it? A routed lead lands
  // in that shop's Incoming tab as a Lead row with status ROUTED, and stays
  // ROUTED until someone there accepts it. "Routed" and "accepted" are two
  // different answers to "where is this homeowner", so the sheet says which.
  const matchedLeadIds = platformLeads
    .map((p) => p.matchedLeadId)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const shopLeadStatus = new Map<string, string>();
  if (matchedLeadIds.length) {
    const rows = await db.lead.findMany({
      where: { id: { in: matchedLeadIds } },
      select: { id: true, status: true },
    });
    for (const r of rows) shopLeadStatus.set(r.id, r.status);
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
      lat: p.lat,
      lng: p.lng,
      status: p.status,
      attemptCount: p.attemptCount,
      queueReason: p.queueReason,
      matchedOrgName: p.matchedOrgId ? (orgName.get(p.matchedOrgId) ?? null) : null,
      // Whichever contractor the row is about — the one that has it, else the
      // one currently holding the offer. The row's "Went to" cell opens them.
      wentToOrgId: p.matchedOrgId ?? active?.organizationId ?? null,
      matchedAt: p.matchedAt ? p.matchedAt.toISOString() : null,
      manuallyAssigned: p.assignedByAdminId != null,
      shopLeadStatus: p.matchedLeadId ? (shopLeadStatus.get(p.matchedLeadId) ?? null) : null,
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

  // How each shop has behaved: offers seen, offers taken, leads currently held.
  // One grouped pass each — a row per shop per stat would not scale, and this
  // roster is read on every visit.
  const [offerCounts, acceptCounts, matchedCounts] = await Promise.all([
    db.leadOffer.groupBy({ by: ["organizationId"], _count: { _all: true } }),
    db.leadOffer.groupBy({ by: ["organizationId"], where: { status: "ACCEPTED" }, _count: { _all: true } }),
    db.platformLead.groupBy({
      by: ["matchedOrgId"],
      where: { matchedOrgId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const offersBy = new Map(offerCounts.map((r) => [r.organizationId, r._count._all]));
  const acceptsBy = new Map(acceptCounts.map((r) => [r.organizationId, r._count._all]));
  const matchedBy = new Map(matchedCounts.map((r) => [r.matchedOrgId as string, r._count._all]));

  const orgPicks: OrgPickDTO[] = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    trades: parseTradeTypes(o.tradeTypesJson),
    otherTrade: o.otherTrade,
    geocoded: o.lat != null && o.lng != null,
    lat: o.lat,
    lng: o.lng,
    address: o.address,
    phone: o.phone,
    email: o.billingEmail,
    offersEnabled: o.leadOffersEnabled,
    offersReceived: offersBy.get(o.id) ?? 0,
    offersAccepted: acceptsBy.get(o.id) ?? 0,
    leadsMatched: matchedBy.get(o.id) ?? 0,
    joinedAt: o.createdAt.toISOString(),
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
  const dist = countBy(last30).slice(0, 6);
  const distMax = dist[0]?.[1] ?? 1;
  const tradeDist = dist.map(([trade, n]) => ({ trade, n, pct: Math.round((n / distMax) * 100) }));

  const accepted = resolvedOffers.filter((o) => o.status === "ACCEPTED");
  const acceptRatePct = resolvedOffers.length ? (accepted.length / resolvedOffers.length) * 100 : null;
  const medianAcceptMin = median(
    accepted
      .filter((o) => o.respondedAt)
      .map((o) => (o.respondedAt!.getTime() - o.createdAt.getTime()) / 60_000),
  );
  const routedTotal = await db.platformLead.count({ where: { status: "MATCHED" } });

  const stats: StatsDTO = {
    todayCreated: todayRows.length,
    todayMatched: recent.filter((p) => p.matchedAt && p.matchedAt >= today).length,
    tradeDist,
    acceptRatePct,
    medianAcceptMin,
    routedTotal,
    openOffers: openOffers.length,
    expiringSoon: openOffers.filter((o) => o.expiresAt.getTime() - now.getTime() < 12 * 60 * 60 * 1000).length,
    queue: platformLeads.filter((p) => p.status === "MANUAL_QUEUE").length,
  };

  const routingMode = await getRoutingMode();

  return (
    <AdminLeadCenterContent
      leads={leads}
      orgs={orgPicks}
      stats={stats}
      routingMode={routingMode}
    />
  );
}
