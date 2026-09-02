"use client";
import * as React from "react";
import {
  AnnouncementBanner,
  type Announcement,
} from "@/components/comms/AnnouncementBanner";

// The banner's × hides the announcement for THIS viewer, in this tab — nothing
// is written. Announcements are platform-scoped now and managed from the admin
// console (/admin/announcements); a tenant dismissing one should not end it for
// every other organization, which is what the old org-scoped server dismiss
// turned into once the board moved.
export function DashboardAnnouncementDismiss({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const visible = announcements.filter((a) => !hidden.has(a.id));
  if (visible.length === 0) return null;
  return (
    <AnnouncementBanner
      announcements={visible}
      onDismiss={async (id) => {
        setHidden((prev) => new Set(prev).add(id));
      }}
    />
  );
}
