"use client";

// VIEWPORT SWITCH for /dashboard/jobs/[id].
//
// The desktop blueprint page above 768px, the handheld rebuild at or below it,
// from ONE URL. Same contract, same rules, same literals as the sibling
// mobile-project-detail/project-detail-viewport-switch.tsx — read that file's
// header for the full reasoning; the short version:
//
//   · the switch is a MEDIA QUERY, never the user agent (CLAUDE.md forbids UA
//     detection, and a query is the only thing that makes the DevTools device
//     toolbar swap live without a reload);
//   · EXACTLY ONE TREE IS MOUNTED. The handheld shell is `position: fixed;
//     inset: 0` and locks body scrolling, so rendering it over a live desktop
//     shell would strand the desktop scroll and leave the sidebar's links in
//     the tab order under an opaque overlay;
//   · `dynamic(…, { ssr: false, loading: MobileHold })` so a desktop visitor
//     never downloads the handheld bundle.
//
// ── WHY THE PAGE OWNS THIS AND NOT THE SHELL ───────────────────────────────
// HANDHELD_SURFACES in responsive-shell/responsive-dashboard-shell.tsx is
// keyed by an EXACT pathname. This route is dynamic — /dashboard/jobs/<id> —
// so no literal key can match it. Hence the switch lives with the page, and
// the shell gets a matching guard that renders this route bare at ≤768px
// instead of wrapping it in BlueprintShell. Both sides read the same
// `(max-width: 768px)` literal, so they flip in the same commit.
//
// Both sides take the SAME prop — the record the server page read through
// job-detail-blueprint/job-detail-load.ts. The switch chooses a layout, never
// a dataset: whichever edition mounts is describing the same Job row.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { JobDetailContent } from "@/components/v3/job-detail-blueprint/job-detail-content";
import type { JobDetailRecord } from "@/components/v3/job-detail-blueprint/job-detail-data";
import { ChunkRecoveryBoundary } from "@/components/v3/shared/chunk-recovery-boundary";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold. Inline styles on purpose: this has to paint
// before the handheld stylesheet has been fetched, which is also why the
// #f2f0eb drafting cream is written out rather than read from --paper.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "#f2f0eb" }} />
);

// Imported out of its own module rather than copied, so /mobile-job-detail-v1
// and /dashboard/jobs/[id] cannot drift: one implementation, two entries.
const MobileJobDetail = dynamic(
  () => import("./mobile-job-detail").then((m) => m.MobileJobDetail),
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

export function JobDetailViewportSwitch({ record }: { record: JobDetailRecord }) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The handheld half is a lazy chunk, so it inherits the deploy-skew failure
  // the shell's surfaces have: a build that lands while this tab is open turns
  // the import into a 404 and the 404 into "a client-side exception has
  // occurred". The boundary spends one reload on it. See the boundary's header.
  if (isHandheld) {
    return (
      <ChunkRecoveryBoundary>
        <MobileJobDetail record={record} />
      </ChunkRecoveryBoundary>
    );
  }
  return <JobDetailContent record={record} />;
}
