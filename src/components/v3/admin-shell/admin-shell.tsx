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

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initBlueprintShell, type ShellHandle } from "@/components/v3/blueprint-shell/shell-behavior";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import announcementsStyles from "@/components/v3/announcements-blueprint/announcements.module.css";
import styles from "./admin-shell.module.css";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar, type SignOutMode } from "./admin-topbar";

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
}: {
  children: React.ReactNode;
  /** Display name for the topbar and the sidebar's account plate. Read
   *  server-side by the (admin) layout — there is no SessionProvider here. */
  adminName: string;
  /** Which door the admin came through, so Sign out clears the right thing. */
  signOutMode: SignOutMode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellHandle | null>(null);
  const pathname = usePathname() ?? "/admin";

  useEffect(() => {
    if (!rootRef.current) return;
    const handle = initBlueprintShell(rootRef.current);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  // React re-renders which item carries `active`; the plate follows it.
  useEffect(() => {
    handleRef.current?.syncIndicator();
  }, [pathname]);

  return (
    <div
      ref={rootRef}
      className={[proposalStyles.bp, dashboardStyles.bp, adminPageStyle(pathname), "jf-blueprint", styles.admin]
        .filter(Boolean)
        .join(" ")}
      data-page="admin"
    >
      <Sprite />

      <div className="layout">
        <AdminSidebar adminName={adminName} />

        <div className="sb-overlay" id="sbOverlay"></div>

        <div className="main">
          <AdminTopbar adminName={adminName} signOutMode={signOutMode} />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
