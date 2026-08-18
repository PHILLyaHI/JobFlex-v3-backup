// Mobile dashboard (mobile-v2) — the constants the handheld sheet draws with.
//
// This file used to hold the donor's demo fixture: a fixed week of jobs, a
// twelve-row activity feed, thirteen invented leads with invented dollar
// values, and three hand-written revenue series. All of it is gone. The
// surface now renders `DashboardData` — the same org-scoped read the desktop
// Overview runs — reached either as a prop from ./page.tsx or through the
// `getDashboardData` action when the responsive shell mounts the component
// props-less at ≤768px.
//
// What survives is what was never data: the phone's plot geometry, the range
// buttons, the board's column list, and the shared nav map re-export.

// ---- Revenue chart geometry ---------------------------------------------
// Mobile plot box. The desktop donor uses viewBox 860×332 with symmetric 70px
// margins; scaled into a 320px-wide phone that renders the 13px mono axis
// labels at ~4px. The box is re-cut for the phone — everything else (square
// points, computed peak, self-drawing line) is the reference behaviour.
export const PLOT = { x0: 38, x1: 328, y0: 10, y1: 170 } as const;
export const Y_ROWS = [10, 50, 90, 130, 170] as const;

export type RangeKey = "7d" | "30d" | "90d";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
];

// ---- Lead flow board -----------------------------------------------------
// The five live-pipeline columns, in order. Keys are the lowercased
// `Lead.status` values, matching `BOARD_STATUSES` in the shared blueprint data
// module — `updateLeadStatus` is handed the uppercase form.
export const STAGE_KEYS = ["new", "routed", "claimed", "contacted", "quoted"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const LEAD_STAGES: { key: StageKey; label: string }[] = [
  { key: "new", label: "New" },
  { key: "routed", label: "Routed" },
  { key: "claimed", label: "Claimed" },
  { key: "contacted", label: "Contacted" },
  { key: "quoted", label: "Quoted" },
];

/**
 * How many day cells the week strip shows. Seven does not fit: at 320px each
 * cell would be ~41px wide, under the 44px touch minimum. Five clears it on
 * every handheld, and the window is chosen at render time so it always
 * contains today (see `weekWindow` in ./mobile-dashboard.tsx).
 */
export const WEEK_CELLS = 5;

/**
 * Navigation drawer — the reference sidebar's full map, pulled out by the
 * burger. This replaced the bottom tab bar at the owner's call (2026-07-24).
 * Account is deliberately NOT in the nav: it lives in the drawer's pinned
 * footer, same as the desktop shell.
 *
 * Re-exported from the shared blueprint nav map (2026-07-29) rather than
 * duplicated. The copy that used to live here carried no href at all, which is
 * exactly why every drawer link was dead and the drawer could not change
 * pages. Both mobile surfaces import NAV_SECTIONS from this module, so
 * re-exporting keeps their import paths untouched while handing them the real
 * routes — and there is now one list to edit, not two to keep in step.
 */
export {
  NAV_SECTIONS,
  activeHref,
  // The role filter, same re-export rule: this surface's drawer is the third
  // consumer of the nav map, so it takes the ONE rule from it rather than
  // growing a fourth opinion about who sees what.
  navSectionsFor,
  type NavItem,
  type NavSection,
} from "@/components/v3/blueprint-shell/nav-map";
