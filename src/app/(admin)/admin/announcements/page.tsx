// Admin · Announcements — the blueprint announcements board, moved to the
// platform console (owner request 2026-09-02: the page left the contractor
// dashboard and lives here now).
//
// SCOPE. Everything on this board is scope="PLATFORM": one row shows as a
// banner on EVERY tenant's dashboard (the (dashboard) layout reads platform
// rows alongside the org's own). Publish goes through sendPlatformCampaign,
// retire through retirePlatformCampaign — both platform-admin gated in
// src/actions/admin.ts.
//
// The (admin) layout guards the route group; this page guards itself too, so a
// direct render can never reach the query below without a platform admin.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { longDate } from "@/lib/format";
import { AnnouncementsContent } from "@/components/v3/announcements-blueprint/announcements-content";
import type { Announcement } from "@/components/v3/announcements-blueprint/announcements-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Announcements",
  description: "Platform announcements — active banners on every organization's dashboard, and the archive.",
};

export default async function AdminAnnouncementsPage() {
  await requirePlatformAdmin();

  const all = await db.announcement.findMany({
    where: { scope: "PLATFORM" },
    orderBy: { createdAt: "desc" },
  });

  // The archive split the board has always used: an announcement is past once
  // its expiry has landed. Retire stamps `expiresAt = now`, so a retired banner
  // falls out of `active` on the next read.
  const now = new Date();
  const entries: Announcement[] = all.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    created: longDate(a.createdAt),
    expires: a.expiresAt ? longDate(a.expiresAt) : null,
    expired: !!(a.expiresAt && a.expiresAt <= now),
  }));

  return <AnnouncementsContent entries={entries} />;
}
