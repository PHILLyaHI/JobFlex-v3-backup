"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { markNavSeen } from "@/actions/notifications";
import type { SeenKey } from "@/lib/badgeCounts";

/**
 * Stamps a nav surface as seen the moment its page mounts, then refreshes the
 * router so the layout (sidebar / tab bar) recomputes badge counts — layouts
 * don't re-render on soft navigation, so a server-side stamp alone leaves the
 * badge visibly stale. Same pattern as the admin inbox's MarkSupportSeen.
 * Runs exactly once per mount (ref guard); router.refresh() re-renders server
 * components without remounting client ones, so it can't loop.
 *
 * The refresh — a full server re-render of the layout AND this page — only
 * fires when the action reports a badge was actually showing. Most visits
 * have nothing to clear, and skipping the refresh there is a big chunk of
 * why navigation to these surfaces feels fast.
 */
export function MarkNavSeen({ surface }: { surface: SeenKey }) {
  const router = useRouter();
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    markNavSeen(surface)
      .then((res) => {
        if (res?.hadNew) router.refresh();
      })
      .catch(() => {});
  }, [surface, router]);

  return null;
}
