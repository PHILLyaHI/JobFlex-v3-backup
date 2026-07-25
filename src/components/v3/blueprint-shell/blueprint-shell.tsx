"use client";

// Blueprint shell — the persistent chrome for every blueprint page.
//
// Mounted from src/app/dashboard/layout.tsx, so the sidebar, topbar, sprite
// and graph-paper field survive navigation: moving between /dashboard and
// /dashboard/proposals swaps ONLY the contents of `.content`, which fades up
// via the donor's reveal cascade. Previously each page owned its own copy of
// the whole shell, so every navigation tore the chrome down and replayed the
// 21-item sidebar cascade — the "screen reload" flicker this replaces.
//
// CSS: both page modules are imported here and both `.bp` classes are applied
// to the root. Every donor rule inside them is `:global(...)`, so they match
// descendants no matter which component imported them — that is what lets one
// shell serve both pages without rewriting either stylesheet. The two tokens
// the donors disagree on are arbitrated in blueprint-global.css via
// `[data-page]`.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initBlueprintShell, type ShellHandle } from "./shell-behavior";
import { Sprite } from "./sprite";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import "@/components/v3/dashboard-blueprint/blueprint-global.css";

/** Drives the `[data-page]` token arbitration in blueprint-global.css. */
function pageKey(pathname: string): string {
  if (pathname.startsWith("/dashboard/proposals")) return "proposals";
  return "dashboard";
}

export function BlueprintShell({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellHandle | null>(null);
  const pathname = usePathname() ?? "/dashboard";

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
      className={`${proposalStyles.bp} ${dashboardStyles.bp} jf-blueprint`}
      data-page={pageKey(pathname)}
    >
      <Sprite />

      <div className="layout">
        <Sidebar />

        <div className="sb-overlay" id="sbOverlay"></div>

        <div className="main">
          <Topbar />
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
