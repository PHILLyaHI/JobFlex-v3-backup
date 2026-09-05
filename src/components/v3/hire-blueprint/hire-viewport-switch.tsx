"use client";

// VIEWPORT SWITCH for /dashboard/hire.
//
// The desktop blueprint board above 768px, the handheld rebuild at or below it,
// from ONE URL — the same contract and the same literals as the sibling
// video-estimator / job-detail / project-detail switches:
//
//   · the switch is a MEDIA QUERY, never the user agent (CLAUDE.md forbids UA
//     detection, and a query is the only thing that makes the DevTools device
//     toolbar swap live without a reload);
//   · EXACTLY ONE TREE IS MOUNTED. The handheld shell is `position: fixed;
//     inset: 0` and locks body scrolling, so rendering it over a live desktop
//     shell would strand the desktop scroll and leave the sidebar's twenty-odd
//     links in the tab order beneath an opaque overlay;
//   · `dynamic(…, { ssr: false, loading: MobileHold })` so a desktop visitor
//     never downloads the handheld bundle.
//
// ── WHY THE PAGE OWNS THIS AND NOT THE SHELL ───────────────────────────────
// HANDHELD_SURFACES in responsive-shell/responsive-dashboard-shell.tsx mounts a
// PROPS-LESS component. Both editions of this page need the same three server
// reads — the open board, the caller's own posts, and who the caller is — so
// the switch has to live where those props are, and the shell carries a
// matching PAGE_OWNED_STATIC entry that renders this route BARE at ≤768px
// instead of wrapping it in BlueprintShell. Both sides read the same
// `(max-width: 768px)` literal, so they flip in the same commit.
//
// Until this existed (owner report, 2026-09-03: "on mobile it leads me to the
// unresponsive website"), a phone opening /dashboard/hire from the sidebar got
// the DESKTOP board — the handheld build was only reachable at its own
// /mobile-hire-v1 URL, which nothing links to. The previous page's handheld
// twin was mounted from the props-less map and was deleted with it.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { ChunkRecoveryBoundary } from "@/components/v3/shared/chunk-recovery-boundary";
import { HireContent } from "./hire-content";
import type { HireOwnPost, HirePost, HireTab, HireViewer } from "./hire-data";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Inline styles on purpose: this has to paint
// before the handheld stylesheet has been fetched, which is also why the
// #f2f0eb drafting cream is written out rather than read from --paper.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "#f2f0eb" }} />
);

// Imported out of its own module rather than copied, so /mobile-hire-v1 and
// /dashboard/hire cannot drift: one implementation, two entries.
const MobileHire = dynamic(
  () => import("@/components/v3/mobile-hire/mobile-hire").then((m) => m.MobileHire),
  { ssr: false, loading: MobileHold },
);

// Module scope so the identities are stable across renders — a fresh
// `subscribe` on every render makes useSyncExternalStore re-subscribe each
// time, which on a resize-driven store means tearing down the listener in the
// middle of the resize that triggered the render.
function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(HANDHELD);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
// The server cannot know the viewport, so it renders desktop and the client
// corrects during hydration — the same trade the shell makes.
const getServerSnapshot = () => false;

export type HireViewportSwitchProps = {
  posts: HirePost[];
  mine: HireOwnPost[];
  viewer: HireViewer;
  initialTab: HireTab;
};

export function HireViewportSwitch(props: HireViewportSwitchProps) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The handheld half is a lazy chunk, so it inherits the deploy-skew failure
  // the shell's surfaces have: a build that lands while this tab is open turns
  // the import into a 404 and the 404 into "a client-side exception has
  // occurred". The boundary spends one reload on it.
  if (isHandheld) {
    return (
      <ChunkRecoveryBoundary>
        <MobileHire {...props} />
      </ChunkRecoveryBoundary>
    );
  }
  return <HireContent {...props} />;
}
