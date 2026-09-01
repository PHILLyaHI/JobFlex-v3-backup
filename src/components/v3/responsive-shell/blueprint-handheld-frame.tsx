"use client";

// A BLUEPRINT PAGE, IN THE HANDHELD CHROME.
//
// Most blueprint routes have a purpose-built mobile page (mobile-*-v2) and the
// responsive shell swaps to it below 768px. A few do not — the manual proposal
// builder is the first — and until now those fell through to the DESKTOP shell:
// a phone got the desk sidebar's topbar and no bottom nav, so the builder was
// the one page in the app you could not navigate away from with a thumb.
//
// This is the middle path. The page's own markup is kept (it is a single
// column and reads fine at 390px); what changes is the chrome around it:
//   · the blueprint root classes, because the page's stylesheet is written
//     against `.jf-blueprint .content` and is meaningless without them,
//   · <MobileNav />, the same top bar, drawer and bottom nav every other
//     handheld surface carries — which is also what mounts the support widget
//     and the estimator picker there,
//   · NO desktop sidebar or topbar.
//
// It is deliberately a frame and not a rebuild: a real handheld design for a
// page belongs in mobile-*-v2, and when one lands, the route moves to
// HANDHELD_SURFACES and this frame stops being used for it.
import { MobileNav } from "@/components/v3/mobile-shell/mobile-nav";
import { Sprite } from "@/components/v3/blueprint-shell/sprite";
import proposalStyles from "@/components/v3/proposals-blueprint/proposals.module.css";
import dashboardStyles from "@/components/v3/dashboard-blueprint/blueprint.module.css";
import styles from "./blueprint-handheld-frame.module.css";

export function BlueprintHandheldFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[proposalStyles.bp, dashboardStyles.bp, "jf-blueprint", styles.frame]
        .filter(Boolean)
        .join(" ")}
    >
      {/* The sprite the blueprint markup draws its icons from; the desk shell
          mounts one and this tree has no desk shell. */}
      <Sprite />
      <MobileNav />
      <div className="layout">
        <div className="main">
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
