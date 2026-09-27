"use client";

// THE OVERLAY LAYER — where every blueprint popup that dims the app renders.
//
// A dialog, sheet or picker with a scrim goes through <OverlayPortal>. Drawn
// inside the page instead, it hits the bug this exists for: `.content` is
// `position: relative; z-index: 1` and `.main` is `isolation: isolate`, so
// both are stacking contexts. A `position: fixed; inset: 0` scrim inside them
// still spans the viewport, but it is PAINTED inside them, whatever its own
// z-index — under the sticky topbar (z-index 30, `.content`'s sibling inside
// `.main`) and under the desktop sidebar (z-index 30, beside `.main`). The
// page darkens; the chrome stays bright. Owner reports: the plan-change
// confirm (2026-09-02, fixed locally by a <body> portal) and Settings → Delete
// account (2026-09-26).
//
// The layer is one empty node the shell renders after `.layout`, as the last
// child of the `.jf-blueprint` root (blueprint-global.css `.bp-layer`). A popup
// portalled into it is:
//   · over the chrome — the layer is its own stacking context at z-index 120,
//     above the sidebar and topbar (30), the handheld drawer (89/90) and the
//     support widget (≤95) whatever z-index the popup gives itself, and under
//     the shell's higher tiers: address suggestions and <BlueprintSheet> (130),
//     the plan-change confirm (140) and ⌘K / the estimator picker (200);
//   · still under FLUID SCALE (the root's `zoom`) and inside the token host,
//     so it draws at the page's scale with the shell's tokens. <body> gives it
//     neither (advanced-ai-content.tsx `dialogHost` has the history).
//
// The one thing it costs: page stylesheets scoped under `.content` do not reach
// a portalled node. Style the popup with its own classes, or re-root the page
// rules it needs on a wrapper class — settings-blueprint/ui.tsx `Modal` does
// that with `.set-layer`.
//
// Outside the desktop shell (the handheld trees render without it) the portal
// falls back to the nearest blueprint root, then to <body>.

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** The layer node. Rendered ONCE, by BlueprintShell, after `.layout`. */
export function OverlayLayer() {
  return <div className="bp-layer" data-overlay-layer="" />;
}

/** Where an overlay renders: the shell's layer, else a blueprint root, else <body>. */
export function overlayHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector<HTMLElement>("[data-overlay-layer]") ??
    document.querySelector<HTMLElement>(".jf-blueprint") ??
    document.body
  );
}

// The host is found, not subscribed to: the layer mounts with the shell and
// outlives every page, so there is nothing to observe.
const subscribe = () => () => {};
const serverHost = () => null;

/**
 * Render `children` into the overlay layer.
 *
 * Nothing renders on the server or in the hydrating pass (the server cannot
 * know the host, and a portal there would not match its HTML); the client
 * paints it on the next pass. Mount it only while the popup is present — it
 * adds no motion, focus or scroll handling of its own.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const host = useSyncExternalStore(subscribe, overlayHost, serverHost);
  return host ? createPortal(children, host) : null;
}
