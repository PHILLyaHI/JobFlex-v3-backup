"use client";

// Admin shell — the blueprint chrome for the platform console (/admin/*).
//
// An ADMIN VARIANT of blueprint-shell, not a fork of it. The dashboard shell is
// hard-wired to the contractor nav: its pageKey() strips /dashboard, its
// PAGE_STYLES map keys on dashboard routes, and its Sidebar reads NAV_SECTIONS
// through the role filter. None of that applies here, so this component mounts
// the same two token-bearing stylesheets (proposals + dashboard modules, whose
// donor rules are all `:global(...)` and therefore match by literal class name
// under any root that carries both `.bp` hashes), the same sprite, the same
// `.layout > .sb + .main > .topbar + .content` skeleton, and the same
// shell-behavior module (drawer, fluid scale, sidebar cascade, sliding
// indicator, parallax) — then swaps in an admin sidebar and an admin topbar.
//
// Nothing is registered in the dashboard shell's PAGE_STYLES. data-page="admin"
// drives the `[data-page]` token arbitration in blueprint-global.css (the
// dashboard donor's hairline values) and is otherwise inert.
//
// ADMIN_PAGE_STYLES below is this shell's own tiny version of that map: the
// announcements board moved here from the contractor dashboard with its donor
// stylesheet intact, and its rules are `.bp :global(.content …)` — they need
// the module's hashed `.bp` on the shell root, applied only while that page is
// the one on screen (same isolation argument as the dashboard map).
//
// CONTENT CONTRACT for the page agents: pages are server components returning
// fragments that become `.content` children. The donor classes they can rely
// on are the dashboard module's `:global` rules — .page-head / .kicker /
// .page-title / .page-actions / .card / .card-head / .card-title / .card-sub /
// .kpi-grid / .kpi / .btn / .ic — see the report for the full list.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { initBlueprintShell, type ShellHandle } from "@/components/v3/blueprint-shell/shell-behavior";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import { ADMIN_SIDEBAR_FOLD_COOKIE, writeSidebarFold } from "@/components/v3/blueprint-shell/sidebar-fold";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import announcementsStyles from "@/components/v3/announcements-blueprint/announcements.module.css";
import styles from "./admin-shell.module.css";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar, type SignOutMode } from "./admin-topbar";

/** The console reads 7% larger than the dashboard's fluid scale (owner,
 *  2026-10-02: "make font size bigger, it's hard to read, too small — 7%").
 *  One multiplier on the shell's zoom, so every font, control and gap on
 *  every admin page grows together and nothing has to be re-measured. */
const ADMIN_SCALE = 1.07;

/** Per-page stylesheets — active page only, keyed by route prefix. */
const ADMIN_PAGE_STYLES: Record<string, string> = {
  "/admin/announcements": announcementsStyles.bp,
};

function adminPageStyle(pathname: string): string | null {
  for (const [prefix, cls] of Object.entries(ADMIN_PAGE_STYLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return cls;
  }
  return null;
}

export function AdminShell({
  children,
  adminName,
  signOutMode,
  sidebarFolded = false,
}: {
  children: React.ReactNode;
  /** Display name for the topbar and the sidebar's account plate. Read
   *  server-side by the (admin) layout — there is no SessionProvider here. */
  adminName: string;
  /** Which door the admin came through, so Sign out clears the right thing. */
  signOutMode: SignOutMode;
  /** Start with the sidebar folded to its icon rail (the console's own cookie). */
  sidebarFolded?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellHandle | null>(null);
  const pathname = usePathname() ?? "/admin";

  // FOLDED SIDEBAR (owner, 2026-10-02: "make admin side bar foldable on the
  // middle arrow"). The dashboard shell's fold, on the same global CSS
  // (`[data-sb="fold"]` in blueprint-global.css): the arrow on the sidebar's
  // edge or ⌘\ / Ctrl+\. Desktop only — at 860px and below the sidebar is a
  // drawer and the attribute changes nothing. Remembered in the console's own
  // cookie, so a folded console does not fold the contractor's dashboard.
  const [folded, setFolded] = useState(sidebarFolded);
  const toggleFold = useCallback(() => {
    setFolded((f) => {
      writeSidebarFold(!f, ADMIN_SIDEBAR_FOLD_COOKIE);
      return !f;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (window.innerWidth <= 860) return;
      e.preventDefault();
      toggleFold();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFold]);

  useEffect(() => {
    if (!rootRef.current) return;
    const handle = initBlueprintShell(rootRef.current, { scale: ADMIN_SCALE });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  // React re-renders which item carries `active`; the plate follows it. A
  // fold re-flows the rows too, so it is measured again once the 0.24 s
  // width transition has settled.
  useEffect(() => {
    handleRef.current?.syncIndicator();
    const settled = window.setTimeout(() => handleRef.current?.syncIndicator(), 280);
    return () => window.clearTimeout(settled);
  }, [pathname, folded]);

  return (
    <div
      ref={rootRef}
      className={[proposalStyles.bp, dashboardStyles.bp, adminPageStyle(pathname), "jf-blueprint", styles.admin]
        .filter(Boolean)
        .join(" ")}
      data-page="admin"
      data-sb={folded ? "fold" : undefined}
    >
      <Sprite />

      <div className="layout">
        <AdminSidebar adminName={adminName} folded={folded} onToggleFold={toggleFold} />

        <div className="sb-overlay" id="sbOverlay"></div>

        <div className="main">
          <AdminTopbar adminName={adminName} signOutMode={signOutMode} />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
