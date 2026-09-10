"use client";

import { openConsentManager, withdrawMarketing } from "@/lib/consent";

/** Reopens the cookie banner in its manage view — the withdrawal path. */
export function CookieSettingsLink({ className = "" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openConsentManager}>
      Cookie settings
    </button>
  );
}

/** The CCPA/CPRA link, always in the footer: marketing off, then the manage
 *  view so the person sees the switch flipped. */
export function DoNotSellLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        withdrawMarketing();
        openConsentManager();
      }}
    >
      Do not sell or share my personal information
    </button>
  );
}
