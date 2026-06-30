"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { markSupportTicketsRead } from "@/actions/support";

/**
 * Clears the admin's unread support badge once they actually open the inbox.
 * Runs exactly once per mount (ref guard) and only when something is unread, so
 * the router.refresh() it triggers can't loop.
 */
export function MarkSupportSeen({ hasUnread }: { hasUnread: boolean }) {
  const router = useRouter();
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current || !hasUnread) return;
    ran.current = true;
    markSupportTicketsRead()
      .then(() => router.refresh())
      .catch(() => {});
  }, [hasUnread, router]);

  return null;
}
