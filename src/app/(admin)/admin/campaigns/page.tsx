// Admin · Campaigns — Blueprint edition.
//
// A platform announcement is one Announcement row with scope="PLATFORM"; the
// dashboard layout reads those into every tenant's banner. That is the whole
// mechanism — no mail, no recipient rows — so the only figures this page can
// show are the rows themselves and the live organization count.
//
// The (admin) layout guards the route group; this page guards itself too, so a
// direct render can never reach the queries below without a platform admin.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  AdminCampaignsContent,
  type CampaignDTO,
} from "@/components/v3/admin-campaigns/campaigns-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Campaigns",
  description: "Platform announcements and the dashboard banners they are showing on.",
};

/** One page of history. `total` says whether there is more behind it. */
const PAGE_SIZE = 50;

export default async function AdminCampaignsPage() {
  await requirePlatformAdmin();

  const [rows, total, organizations] = await Promise.all([
    db.announcement.findMany({
      where: { scope: "PLATFORM" },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: { id: true, title: true, body: true, createdAt: true, expiresAt: true },
    }),
    db.announcement.count({ where: { scope: "PLATFORM" } }),
    db.organization.count(),
  ]);

  // Live/ended is decided here, against one clock — the same comparison the
  // dashboard banner query makes — so the badge cannot drift at hydration.
  const now = new Date().getTime();
  const campaigns: CampaignDTO[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    live: c.expiresAt === null || c.expiresAt.getTime() > now,
  }));

  return (
    <AdminCampaignsContent campaigns={campaigns} total={total} organizations={organizations} />
  );
}
