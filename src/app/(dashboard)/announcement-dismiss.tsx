"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AnnouncementBanner,
  type Announcement,
} from "@/components/comms/AnnouncementBanner";
import { dismissAnnouncement } from "@/actions/announcements";

export function DashboardAnnouncementDismiss({
  announcements,
}: {
  announcements: Announcement[];
}) {
  const router = useRouter();
  if (announcements.length === 0) return null;
  return (
    <AnnouncementBanner
      announcements={announcements}
      onDismiss={async (id) => {
        await dismissAnnouncement(id);
        router.refresh();
      }}
    />
  );
}
