"use client";

// THE CLIENT HALF OF THE CUSTOM-PLAN PAGE GATE.
//
// The server half lives in the two dashboard layouts — but a Next LAYOUT only
// re-renders on a hard load: on a CLIENT-SIDE navigation the layout segment is
// reused and only the page segment re-renders, so a locked sidebar row clicked
// from an open session sailed straight past the server check and onto the
// page. Since 2026-10-06 every add-on page also asks on the server before it
// loads anything (custom-page-gate), so no data of a blocked page reaches the
// browser; this swap remains for the HANDHELD surfaces the shell mounts in
// place of the page (they fetch their own data on mount) — it renders the
// offer INSTEAD of them, so none of their client code runs.
//
// It reads the SAME blocked list the server computed (via the nav provider,
// or a prop where there is no provider) and the viewer's role from the same
// provider: only the owner gets the one-click add.

import { usePathname } from "next/navigation";
import { useNavIdentity, useNavLocked } from "@/components/v3/blueprint-shell/nav-role";
import { isCustomBlockedPath } from "@/lib/customPlan";
import { UpgradeGate } from "./upgrade-gate";
import { HandheldGate } from "./handheld-gate";

export function CustomGateSwap({
  locked,
  isOwner,
  handheld = false,
  children,
}: {
  /** Blocked hrefs where no NavRoleProvider is mounted (the classic layout);
   *  inside the provider the context copy is used and this can be omitted. */
  locked?: string[];
  /** Where no provider carries the role (the classic layout). */
  isOwner?: boolean;
  /** A handheld branch whose children carry their own navigation: the gate
   *  gets the handheld frame (MobileNav) instead. */
  handheld?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const ctxLocked = useNavLocked();
  const identity = useNavIdentity();
  const list = locked ?? ctxLocked;
  if (isCustomBlockedPath(list, pathname)) {
    const owner = isOwner ?? identity.role === "OWNER";
    return handheld ? (
      <HandheldGate pathname={pathname} locked={list} isOwner={owner} />
    ) : (
      <UpgradeGate pathname={pathname} locked={list} isOwner={owner} />
    );
  }
  return <>{children}</>;
}
