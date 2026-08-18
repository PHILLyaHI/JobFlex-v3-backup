"use client";

// VIEWPORT SWITCH for /dashboard/client-detail.
//
// WHAT WAS WRONG. This was the only surface reachable from a handheld page that
// had no handheld chrome. The clients book at ≤768px is the mobile build, its
// cards open the record — and the record arrived wearing the DESKTOP topbar: a
// 240px search field, New Estimate and the notification bell laid out for a
// 1440px bar and clipped off the right edge of a 390px one, with no hamburger
// and therefore no way back into the app but the browser's Back button. The
// page BODY was never the problem; client-detail.module.css has carried a
// ≤768px layer since it was built. Only the chrome was wrong.
//
// WHAT THIS DOES. One URL, two chromes, ONE content component:
//   · above 768px — ClientDetailContent inside BlueprintShell, exactly as
//     before. Nothing about the desktop page changes.
//   · at or below it — the same ClientDetailContent inside the fleet's handheld
//     chrome: MobileNav's ink topbar (burger → the 22-item drawer, New Estimate,
//     search, notifications) over a fixed, self-scrolling body.
//
// The content is not rebuilt and not copied. Every other page-owned switch in
// the fleet (project detail, job detail, subscription) picks between two
// DIFFERENT components because each has a real handheld rebuild; this one picks
// between two SHELLS around one component, because the reuse rule says re-lay
// out what exists before building a second implementation, and what exists
// already collapses correctly. A change to the record therefore lands on both
// viewports at once, which is the point.
//
// ── WHY THE TREE IS SHAPED LIKE THIS ───────────────────────────────────────
// Three classes are load-bearing and they are deliberately NOT all on the same
// element, which is the one non-obvious thing in this file:
//
//   `jf-blueprint` on the OUTER root, because client-detail.module.css scopes
//   every rule `:global(.jf-blueprint) .cls` (see its SCOPING note — the route
//   is deliberately absent from blueprint-shell's PAGE_STYLES), and because
//   useBlueprintContent finds the cascade's host as `.jf-blueprint .content`.
//
//   The two always-on `.bp` classes on the BODY WRAPPER, one level in, because
//   they publish the global `.content` / `.mdl` / `.mf` / `.btn` / `.rv`
//   vocabulary the record and its two dialogs are written in — and because they
//   also carry `.bp :global(button)`, a (0,1,1) reset that strips border,
//   background and colour off every button beneath them. MobileNav's own
//   controls are single hashed classes at (0,1,0), so mounting the nav under a
//   `.bp` root silently deletes the frames from the burger, the bell, the
//   drawer's close button and its account row. Keeping the nav OUTSIDE that
//   wrapper is what lets it draw the same bar it draws on the other 24 handheld
//   surfaces, with no edit to the shared nav module.
//
//   The handheld token set on the outer root instead, because custom properties
//   inherit and the nav now sits above `.bp`'s desktop values. See .mshell in
//   client-detail.module.css for the list and where each value comes from.
//
// BOTH SPRITES ARE MOUNTED, blueprint first. The record draws `i-pen` (Edit)
// and `i-ban` (a declined activity line), and neither symbol exists in the
// handheld sprite MobileNav carries — a `<use>` at a missing id renders an
// empty box that reads as a broken icon. Document order settles the ids the two
// sets share: first wins, so putting the blueprint sprite first means the
// record and the nav both draw exactly the symbols the desktop shell draws.
//
// ── THE OTHER HALF OF THE CONTRACT ─────────────────────────────────────────
// responsive-shell/responsive-dashboard-shell.tsx lists this route in
// PAGE_OWNED_STATIC, so at ≤768px it renders the page BARE instead of wrapping
// it in BlueprintShell. Both files read the same `(max-width: 768px)` literal,
// so they flip together: the desktop content is never left without its shell,
// and the handheld tree — `position: fixed; inset: 0` — is never mounted inside
// one, which would strand the desktop scroll and leave the sidebar's twenty-odd
// links in the tab order under an opaque overlay.

import { useEffect, useSyncExternalStore } from "react";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import { ClientDetailContent } from "./client-detail-content";
import type { ClientDetailView } from "./client-detail-load";
import { cx } from "./cd-ui";
import styles from "./client-detail.module.css";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

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
// corrects during hydration — the same trade every switch in the fleet makes,
// and for the same reason: rendering nothing until mounted flashes blank for
// every visitor on every viewport.
const getServerSnapshot = () => false;

export function ClientDetailViewportSwitch({ view }: { view: ClientDetailView }) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <HandheldRecord view={view} /> : <ClientDetailContent view={view} />;
}

/**
 * The handheld chrome.
 *
 * Its own component so the viewport-height publisher mounts and unmounts WITH
 * the handheld tree — declared in the switch it would have to be guarded by the
 * same boolean, and an effect that no-ops on one branch is an effect that
 * eventually runs on the wrong one.
 *
 * NO SCROLL LOCK HERE. blueprint-global.css already pins `html`/`body` to
 * `height: 100%; overflow: hidden` for as long as a `.jf-blueprint` root is in
 * the document, which this tree is; adding a second, reference-counted lock on
 * top would be two mechanisms holding one fact.
 */
function HandheldRecord({ view }: { view: ClientDetailView }) {
  // The fleet's mandatory rule: viewport heights only through var(--app-h). A
  // phone's URL bar changes innerHeight mid-scroll, so the real value is
  // republished rather than trusting a bare 100vh/100dvh. The same effect the
  // twenty-odd (mobile) pages run, so a reader moving between them and this
  // record never sees the bottom of the page move.
  useEffect(() => {
    const apply = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--app-h");
    };
  }, []);

  return (
    <div className={cx("jf-blueprint", styles.mshell)} data-page="client-detail">
      <Sprite />
      <MobileNav />
      <div className={cx(proposalStyles.bp, dashboardStyles.bp, styles.mshellBody)}>
        {/* `main` as well as the module class: `.bp :global(.main)` is what
            makes this the scroller and paints the graph-paper ground behind the
            record, and useBlueprintContent resets `content.closest(".main")` on
            navigation so a second record never opens half-scrolled. */}
        <div className={cx("main", styles.mshellScroll)}>
          <div className="content">
            <ClientDetailContent view={view} />
          </div>
        </div>
      </div>
    </div>
  );
}
