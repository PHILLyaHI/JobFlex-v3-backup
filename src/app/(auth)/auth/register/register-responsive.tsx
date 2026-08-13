"use client";

// Viewport switch for /auth/register.
//
// One URL, two designs: the blueprint desktop build above 768px, the handheld
// rebuild at or below it. The switch is a MEDIA QUERY, never the user agent —
// the mobile-first rule forbids UA detection, and a query is also the only
// thing that makes DevTools' device toolbar work: drag the viewport under
// 768px and the surface swaps live, no reload and no second URL to remember.
//
// WHY A SIBLING FILE HERE, but an inline switch on /auth/login. This page is a
// server component (it owns `metadata`), so the switch has to be a separate
// client module regardless. Login's page is already `"use client"` and its
// desktop tree is defined in the same file, so a sibling switch there would
// have to import from the page while the page imported the switch — a cycle.
//
// EXACTLY ONE TREE IS MOUNTED, never both. Both branches call the same
// `registerAccount` server action and both mount the attribution capture that
// reads ?promo / ?ref; two live trees would put a second set of account fields
// in the tab order and run the capture twice against one page view.
//
// The handheld build previously shipped only at /mobile-v1/auth/register,
// which nothing linked to. That preview URL still works; this is what makes
// the real URL serve it.

import dynamic from "next/dynamic";
import { Suspense, useSyncExternalStore } from "react";
import { RegisterContent } from "@/components/v3/auth-register-blueprint/register-content";

/** CLAUDE.md's handheld target: ≤768px. Matches the mobile module's own scale. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app — which reads as a crash rather
// than a load. Inline styles on purpose: this has to paint before the handheld
// stylesheet has been fetched, which is also why the #f2f0eb drafting cream is
// written out rather than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#f2f0eb" }} />
);

// Imported out of the (mobile) tree rather than copied, so /auth/register and
// /mobile-v1/auth/register cannot drift apart — one implementation, two entry
// points. Lazy and `ssr: false` so a desktop visitor never downloads the
// handheld bundle or its stylesheet for a tree they will not render.
const MobileRegister = dynamic(
  () =>
    import("@/components/v3/mobile-auth-register/mobile-register-content").then(
      (m) => m.MobileRegisterContent,
    ),
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
// corrects during hydration. A phone therefore shows desktop for one frame; the
// alternative — render nothing until mounted — flashes blank for every visitor
// at every viewport, a worse trade on a signup page.
const getServerSnapshot = () => false;

function RegisterSwitch() {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileRegister /> : <RegisterContent />;
}

// The attribution capture under either tree reads the query string, so the
// boundary wraps the switch rather than either branch — a bare useSearchParams
// without one is a static-prerender bailout in Next.
export function RegisterResponsive() {
  return (
    <Suspense fallback={null}>
      <RegisterSwitch />
    </Suspense>
  );
}
