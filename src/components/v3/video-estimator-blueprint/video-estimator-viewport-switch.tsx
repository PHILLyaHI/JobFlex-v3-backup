"use client";

// VIEWPORT SWITCH for /dashboard/video-estimator.
//
// The desktop blueprint page above 768px, the handheld rebuild at or below it,
// from ONE URL — the same contract, rules and literals as the sibling
// job-detail / project-detail switches. Read either of those headers for the
// full reasoning; the short version:
//
//   · the switch is a MEDIA QUERY, never the user agent (CLAUDE.md forbids UA
//     detection, and a query is the only thing that makes the DevTools device
//     toolbar swap live without a reload);
//   · EXACTLY ONE TREE IS MOUNTED. The handheld shell is `position: fixed;
//     inset: 0` and locks body scrolling, so rendering it over a live desktop
//     shell would strand the desktop scroll and leave the sidebar's links in the
//     tab order under an opaque overlay;
//   · `dynamic(…, { ssr: false, loading: MobileHold })` so a desktop visitor
//     never downloads the handheld bundle.
//
// ── WHY THE PAGE OWNS THIS AND NOT THE SHELL ───────────────────────────────
// HANDHELD_SURFACES in responsive-shell/responsive-dashboard-shell.tsx mounts a
// PROPS-LESS component. Both editions of this page need two facts the server
// read — the org's next ticket number and whether the estimator key is
// configured — so the switch has to live where those props are, and the shell
// gets a matching PAGE_OWNED_STATIC entry that renders this route bare at
// ≤768px instead of wrapping it in BlueprintShell. Both sides read the same
// `(max-width: 768px)` literal, so they flip in the same commit.
//
// Until this existed, a phone opening /dashboard/video-estimator got the
// DESKTOP page: the handheld build was only reachable at its own
// /mobile-video-estimator-v1 URL, which nothing links to.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { VideoEstimatorContent } from "./video-estimator-content";
import { ChunkRecoveryBoundary } from "@/components/v3/shared/chunk-recovery-boundary";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold. Inline styles on purpose: this has to paint
// before the handheld stylesheet has been fetched, which is also why the
// #f2f0eb drafting cream is written out rather than read from --paper.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "#f2f0eb" }} />
);

// Imported out of its own module rather than copied, so /mobile-video-estimator-v1
// and /dashboard/video-estimator cannot drift: one implementation, two entries.
const MobileVideoEstimator = dynamic(
  () =>
    import("@/components/v3/mobile-video-estimator/mobile-video-estimator").then(
      (m) => m.MobileVideoEstimator,
    ),
  { ssr: false, loading: MobileHold },
);

// Module scope so the identities are stable across renders — a fresh
// `subscribe` on every render makes useSyncExternalStore re-subscribe each time,
// which on a resize-driven store means tearing down the listener in the middle
// of the resize that triggered the render.
function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(HANDHELD);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
// The server cannot know the viewport, so it renders desktop and the client
// corrects during hydration — the same trade the shell makes.
const getServerSnapshot = () => false;

export function VideoEstimatorViewportSwitch({
  ticketNo,
  aiEnabled,
}: {
  ticketNo: number;
  aiEnabled: boolean;
}) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The handheld half is a lazy chunk, so it inherits the deploy-skew failure
  // the shell's surfaces have: a build that lands while this tab is open turns
  // the import into a 404 and the 404 into "a client-side exception has
  // occurred". The boundary spends one reload on it.
  if (isHandheld) {
    return (
      <ChunkRecoveryBoundary>
        <MobileVideoEstimator ticketNo={ticketNo} aiEnabled={aiEnabled} />
      </ChunkRecoveryBoundary>
    );
  }
  return <VideoEstimatorContent ticketNo={ticketNo} aiEnabled={aiEnabled} />;
}
