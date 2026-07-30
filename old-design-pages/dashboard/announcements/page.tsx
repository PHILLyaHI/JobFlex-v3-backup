import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { AnnouncementBanner } from "@/components/comms/AnnouncementBanner";
import { Badge } from "@/components/ui/Badge";
import { longDate } from "@/lib/format";
import { NewAnnouncementButton } from "./new-announcement-button";

export default async function AnnouncementsPage() {
  const { organizationId } = await requireOrg();
  const all = await db.announcement.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  const active = all.filter((a) => !a.expiresAt || a.expiresAt > now);
  const past = all.filter((a) => a.expiresAt && a.expiresAt <= now);

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Announcements"
        description="Org-wide banners that pin to the top of every dashboard page. Use sparingly — high-priority ones read as urgent."
        actions={<NewAnnouncementButton />}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Active</CardTitle>
            <CardSubtitle>Visible on every dashboard page right now.</CardSubtitle>
          </div>
          <Badge tone="accent">{active.length}</Badge>
        </CardHeader>
        {active.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No active announcements.</p>
        ) : (
          <AnnouncementBanner announcements={active} />
        )}
      </Card>

      {past.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <div>
              <CardTitle>Archive</CardTitle>
              <CardSubtitle>{past.length} past announcement{past.length === 1 ? "" : "s"}.</CardSubtitle>
            </div>
          </CardHeader>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {past.map((a) => (
              <li key={a.id} className="py-3">
                <div className="text-[13px] font-medium text-[color:var(--ink)]">{a.title}</div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                  {a.body}
                </div>
                <div className="text-[10px] text-[color:var(--ink-faint)] tabular mt-1">
                  Expired {longDate(a.expiresAt)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
