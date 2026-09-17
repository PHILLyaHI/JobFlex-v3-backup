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
 *  asked for) and the visit's utm_*, for 30 days. Called after paint by this
 *  component and SYNCHRONOUSLY by the Google button before it leaves for
 *  Google, so the return from Google finds both even when the click beat the
 *  effect. */
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
      capture remembers `?promo=`. The cookie is for /auth/register ONLY — it
      pre-selects the trade when the visitor arrives there later with no
      parameter (and on the return from Google). The landing itself never
      reads it (owner, 2026-09-10): no parameter is always the default page.

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
    trackTraffic(TRAFFIC_EVENTS.landingView, { industry: industry ?? "default", variant: "e", ...utm });
    // One capture per page load; the props only change on a full navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
