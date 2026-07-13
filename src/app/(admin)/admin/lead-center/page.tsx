import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { parseTradeTypes } from "@/lib/tradeTypes";
import {
  LeadCenterClient,
  type PlatformLeadDTO,
  type OrgPickDTO,
  type RankEntry,
} from "./lead-center-client";

export default async function AdminLeadCenterPage() {
  await requirePlatformAdmin();

  const [platformLeads, orgs] = await Promise.all([
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
  ]);

  const matchedOrgIds = [
    ...new Set(platformLeads.map((p) => p.matchedOrgId).filter((v): v is string => !!v)),
  ];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  // matchedOrgId has no Prisma relation — resolve any names missing from the picker list.
  const unresolved = matchedOrgIds.filter((id) => !orgName.has(id));
  if (unresolved.length) {
    const extra = await db.organization.findMany({
      where: { id: { in: unresolved } },
      select: { id: true, name: true },
    });
    for (const o of extra) orgName.set(o.id, o.name);
  }

  const dto: PlatformLeadDTO[] = platformLeads.map((p) => {
    let ranking: RankEntry[] = [];
    try {
      ranking = JSON.parse(p.rankingJson ?? "[]");
    } catch {
      ranking = [];
    }
    const activeOffer = p.offers.find((o) => o.status === "OFFERED");
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
      })),
      activeOffer: activeOffer
        ? {
            orgName: activeOffer.organization.name,
            attempt: activeOffer.attempt,
            expiresAt: activeOffer.expiresAt.toISOString(),
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

  const routing = dto.filter((p) => p.status === "MATCHING" || p.status === "OFFERED").length;
  const manual = dto.filter((p) => p.status === "MANUAL_QUEUE").length;
  const matched = dto.filter((p) => p.status === "MATCHED").length;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Lead Center"
        description="Homeowner requests routed to the best-matching shop — by trade, distance, and rating. Offers expire after 24 hours and cascade; three strikes lands a lead here for manual assignment."
      />
      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="In routing" value={String(routing)} hint="matching or offered" />
        <StatCard label="Needs manual assignment" value={String(manual)} />
        <StatCard label="Matched" value={String(matched)} hint="of the latest 200" />
      </StaggerGrid>
      <LeadCenterClient leads={dto} orgs={orgPicks} />
    </>
  );
}
