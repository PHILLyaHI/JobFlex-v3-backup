"use client";

// THE GATE ON A PHONE, WITH ITS NAVIGATION (owner, 2026-10-06). On a handheld
// route the shell renders a mobile surface INSTEAD of the page, and that
// surface is what carries the top bar and drawer (MobileNav) — so a gate drawn
// in its place stood alone on the screen with two buttons and no way into
// the rest of the app. Here the gate sits in the same handheld frame the
// blueprint pages use, MobileNav and all. Where no nav provider is mounted
// (the standalone /mobile-* URLs), one is given from the server's identity.

import { BlueprintHandheldFrame } from "@/components/v3/responsive-shell/blueprint-handheld-frame";
import { NavRoleProvider, type NavIdentity } from "@/components/v3/blueprint-shell/nav-role";
import { UpgradeGate } from "./upgrade-gate";

export function HandheldGate({
  pathname,
  locked,
  isOwner,
  identity,
}: {
  pathname: string;
  locked?: readonly string[];
  isOwner?: boolean;
  /** Set where no NavRoleProvider is mounted above (the (mobile) group). */
  identity?: NavIdentity;
}) {
  const frame = (
    <BlueprintHandheldFrame>
      <UpgradeGate pathname={pathname} locked={locked} isOwner={isOwner} />
    </BlueprintHandheldFrame>
  );
  return identity ? (
    <NavRoleProvider identity={identity} locked={locked ? [...locked] : undefined}>
      {frame}
    </NavRoleProvider>
  ) : (
    frame
  );
}
