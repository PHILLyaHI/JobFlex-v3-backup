"use client";

// Partner portal shell — the blueprint chrome for /influencer/*.
//
// A THIRD VARIANT of the same arrangement, not a fork: the dashboard shell is
// wired to the contractor nav and the admin shell to the console's, and neither
// applies to a partner. So this mounts the same two token-bearing stylesheets
// (proposals + dashboard modules, whose donor rules are all `:global(...)` and
// therefore match by literal class name under any root carrying both `.bp`
// hashes), the same sprite, the same
// `.layout > .sb + .main > .topbar + .content` skeleton, and the same
// shell-behavior module (drawer, fluid scale, sidebar cascade, sliding
// indicator) — then swaps in a partner sidebar and a partner topbar.
//
// data-page="admin" drives the `[data-page]` token arbitration in
// blueprint-global.css (the dashboard donor's hairline values) and is otherwise
// inert; the partner portal wants those same hairlines, so it declares the same
// value rather than adding a third arbitration branch for identical numbers.
//
// There is no per-page stylesheet map here: the three partner surfaces share one
// module, so nothing needs to be mounted per route.
//
// CONTENT CONTRACT: pages are server components returning fragments that become
// `.content` children, and the donor classes they can rely on are the dashboard
// module's `:global` rules — .page-head / .kicker / .page-title / .page-actions
// / .card / .card-head / .card-title / .card-sub / .kpi-grid / .kpi / .btn /
// .ic. Everything beyond that comes from the shared admin kit
// (admin-influencers/admin-ui) rather than being rebuilt here.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initBlueprintShell, type ShellHandle } from "@/components/v3/blueprint-shell/shell-behavior";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";
import styles from "./influencer-shell.module.css";
import { InfluencerSidebar } from "./influencer-sidebar";
import { InfluencerTopbar } from "./influencer-topbar";

export function InfluencerShell({
  children,
  partnerName,
}: {
  children: React.ReactNode;
  /** Display name for the topbar and the sidebar's account plate. Read
   *  server-side by the (influencer) layout — there is no SessionProvider in
   *  the blueprint tree, by the same argument blueprint-shell/nav-role makes. */
  partnerName: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellHandle | null>(null);
  const pathname = usePathname() ?? "/influencer";

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
      className={[proposalStyles.bp, dashboardStyles.bp, "jf-blueprint", styles.partner]
        .filter(Boolean)
        .join(" ")}
      data-page="admin"
    >
      <Sprite />

      <div className="layout">
        <InfluencerSidebar partnerName={partnerName} />

        <div className="sb-overlay" id="sbOverlay"></div>

        <div className="main">
          <InfluencerTopbar partnerName={partnerName} />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
