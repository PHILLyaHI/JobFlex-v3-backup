// Partner portal — the navigation map. ONE source of truth for the desktop
// sidebar and the handheld drawer (the same `.sb` markup; the donor's mobile
// layer turns it into a drawer below 860px).
//
// Plain data + pure functions, no "use client" — importable from the server
// layout as well as the client sidebar. Shaped like blueprint-shell/nav-map's
// NavSection so the sidebar markup stays the donor's verbatim, the same
// arrangement admin-shell/admin-nav.ts uses.
//
// Three surfaces, no sections: a partner has one job here and a labelled group
// above three links would be furniture with nothing to organise.
//
// Icons are sprite symbol ids from proposals-blueprint/sprite.tsx, which this
// shell mounts. None are invented.

import type { NavSection } from "@/components/v3/blueprint-shell/nav-map";

export const INFLUENCER_HOME = "/influencer";

export const INFLUENCER_NAV_SECTIONS: NavSection[] = [
  {
    label: "Partner",
    items: [
      { label: "Overview", icon: "i-grid", href: "/influencer" },
      { label: "Earnings", icon: "i-chart", href: "/influencer/earnings" },
      { label: "Payouts", icon: "i-bank", href: "/influencer/payouts" },
    ],
  },
];

/**
 * The nav item that owns `pathname`: exact match for the Overview root, longest
 * prefix match for the rest, so a child route keeps its parent lit. Null when
 * nothing in the map claims the path.
 */
export function activeInfluencerHref(pathname: string): string | null {
  let best: string | null = null;
  for (const section of INFLUENCER_NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === INFLUENCER_HOME) {
        if (pathname === INFLUENCER_HOME && best === null) best = item.href;
        continue;
      }
      const hit = pathname === item.href || pathname.startsWith(item.href + "/");
      if (hit && (best === null || item.href.length > best.length)) best = item.href;
    }
  }
  return best;
}
