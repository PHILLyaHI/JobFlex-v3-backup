"use client";

// THE CLIENT HALF OF THE CUSTOM-PLAN PAGE GATE.
//
// The server half lives in the two dashboard layouts — but a Next LAYOUT only
// re-renders on a hard load: on a CLIENT-SIDE navigation the layout segment is
// reused and only the page segment re-renders, so a locked sidebar row clicked
// from an open session sailed straight past the server check and onto the
// page. (The role gate has the same shape, but the middleware backs IT on
// every request; a plan gate needs the DB and the middleware is edge-runtime.)
//
// This wrapper closes that half: it reads the SAME blocked list the server
// computed (via the nav provider, or a prop where there is no provider) and,
// when the client-side pathname falls under it, renders the upgrade offer
// INSTEAD of the children. The page's RSC payload may have been fetched by
// the router, but it is never painted and none of its client code mounts.

import { usePathname } from "next/navigation";
import { useNavLocked } from "@/components/v3/blueprint-shell/nav-role";
import { isCustomBlockedPath } from "@/lib/customPlan";
import { UpgradeGate } from "./upgrade-gate";

export function CustomGateSwap({
  locked,
  children,
}: {
  /** Blocked hrefs where no NavRoleProvider is mounted (the classic layout);
   *  inside the provider the context copy is used and this can be omitted. */
  locked?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const ctxLocked = useNavLocked();
  const list = locked ?? ctxLocked;
  if (isCustomBlockedPath(list, pathname)) {
    return <UpgradeGate pathname={pathname} />;
  }
  return <>{children}</>;
}
