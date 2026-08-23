// Announcements — Blueprint edition. Pixel-identical port of the canonical
// announcements donor (jobflex-announcements-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The classic build of this page was archived to
// old-design-pages/dashboard/announcements/page.tsx.
//
// NOT a fixture: the board is read from the database here (the archived classic
// page's query, verbatim — same ordering, same active/expired split) and the
// dialog + the retire × call the real announcement server actions (see
// announcements-behavior.ts). Publish and retire persist; a reload reads the
// same rows back.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { longDate } from "@/lib/format";
import { MarkNavSeen } from "@/components/layout/MarkNavSeen";
import { AnnouncementsContent } from "@/components/v3/announcements-blueprint/announcements-content";
import type { Announcement } from "@/components/v3/announcements-blueprint/announcements-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Announcements",
  description: "Announcements — active org-wide banners and the archive of past notices on one sheet.",
};

export default async function AnnouncementsPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fannouncements");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const all = await db.announcement.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  // The archive split the classic page used: an announcement is past once its
  // expiry has landed. `dismissAnnouncement` retires one by stamping
  // `expiresAt = now`, so a retired banner falls out of `active` on the next read.
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

  return (
    <>
      {/* Clears the announcements nav badge (new banners in force) on open.
          Desktop edition only — the handheld build is stamped by the
          responsive shell (HANDHELD_SEEN). */}
      <MarkNavSeen surface="announcements" />
      <AnnouncementsContent entries={entries} />
    </>
  );
}
