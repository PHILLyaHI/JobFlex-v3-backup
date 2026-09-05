"use client";

// Viewport switch for /dashboard/settings — the URL the sidebar's Settings
// button and the handheld drawer's gear both point at.
//
// One URL, two designs:
//   · above 768px — SettingsContent, the desktop blueprint hub, unchanged;
//   · at or below 768px — the handheld build in components/v3/mobile-settings,
//     the same implementation the preview route /mobile-settings-v1 renders.
//     Not a copy: one module, two entry points.
//
// The switch is a MEDIA QUERY, never the user agent — the mobile-first rule
// forbids UA detection, and a query is also the only thing that makes DevTools'
// device toolbar work. Exactly one tree is mounted: the handheld build is
// `position: fixed; inset: 0` and mounts its own MobileNav, so rendering it
// over a live desktop tree would strand the desktop scroll and leave the
// desktop controls in the tab order underneath.
//
// This route is listed in responsive-dashboard-shell's PAGE_OWNED_STATIC, so at
// handheld width the shell renders it BARE and the handheld build supplies all
// of the chrome itself. That is also why mobile-settings.css's `:has()`-gated
// host neutralizers are inert here and only do their work on the standalone
// /mobile-settings-v1 preview, where the shell is present.
//
// DATA. Both halves are fed the SAME props by the page's server component — one
// SettingsData object from src/lib/settings/loadSettingsData.ts, plus the
// resolved `?pane=` deep link. Nothing is fetched here.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { SettingsContent } from "@/components/v3/settings-blueprint/settings-content";
import type { RailKey, SettingsData } from "@/components/v3/settings-blueprint/settings-data";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app, which reads as a crash. Inline
// styles on purpose: this has to paint before the handheld stylesheet has been
// fetched, which is also why the #f2f0eb drafting cream is written out rather
// than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#f2f0eb" }} />
);

const MobileSettings = dynamic(
  () => import("@/components/v3/mobile-settings/mobile-settings").then((m) => m.MobileSettings),
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
// corrects during hydration — the same trade every other switch in the fleet
// makes, and for the same reason: rendering nothing until mounted flashes blank
// for every visitor on every viewport.
const getServerSnapshot = () => false;

export function SettingsResponsive(props: { data: SettingsData; initialPane?: RailKey }) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileSettings {...props} /> : <SettingsContent {...props} />;
}
