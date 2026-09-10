"use client";

import { useEffect } from "react";
import { trackTraffic } from "@/lib/traffic-client";
import { TRAFFIC_EVENTS } from "@/lib/traffic-contract";
import {
  INDUSTRY_COOKIE,
  INDUSTRY_MAX_AGE_S,
  UTM_COOKIE,
  hasUtm,
  serializeUtm,
  type LandingVariantKey,
  type UtmParams,
} from "./landing-variants";

/** The landing's memory, written from the browser: the trade (when one was
 *  asked for) and the visit's utm_*. Called after paint by this component
 *  and SYNCHRONOUSLY by the Google button before it leaves for Google, so
 *  the return from Google finds both even when the click beat the effect. */
export function writeLandingCookies(industry: LandingVariantKey | undefined, utm: UtmParams | undefined) {
  try {
    if (industry) document.cookie = `${INDUSTRY_COOKIE}=${industry}; path=/; max-age=${INDUSTRY_MAX_AGE_S}; samesite=lax`;
    if (hasUtm(utm)) document.cookie = `${UTM_COOKIE}=${encodeURIComponent(serializeUtm(utm!))}; path=/; max-age=${INDUSTRY_MAX_AGE_S}; samesite=lax`;
  } catch {
    /* cookies blocked — the visit simply is not remembered */
  }
}

/* Invisible. Two side effects of a landing view, both after paint:

   1. MEMORY. When the variant came from an explicit `?industry=` the page
      remembers it for 30 days in a first-party cookie, the same way the promo
      capture remembers `?promo=`. The SERVER reads that cookie on the next
      visit that carries no parameter (src/app/page.tsx), so the returning
      visitor's first byte is already the fence hero — no client swap, no
      flash. A visit with a parameter never reads the cookie; it overwrites it.

   2. ANALYTICS. One `landing_view` per page load with the industry that was
      shown ("default" when none) and whatever utm_* the visit carried. Goes
      through trackTraffic, which queues until PostHog is initialised and
      never throws. No Meta Pixel here by decision (owner, 2026-09-06). */
export function LandingVariantEffects({
  industry,
  remember,
  utm,
}: {
  industry: LandingVariantKey | undefined;
  /** True only when the variant came from the URL, not the cookie. */
  remember: boolean;
  utm: UtmParams;
}) {
  useEffect(() => {
    writeLandingCookies(industry && remember ? industry : undefined, utm);
    trackTraffic(TRAFFIC_EVENTS.landingView, { industry: industry ?? "default", ...utm });
    // One capture per page load; the props only change on a full navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
