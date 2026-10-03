"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CtaTracker } from "@/components/v3/landing-e/cta-tracker";
import {
  pickFbclid,
  pickUtm,
  resolveLandingVariant,
  signupHref,
  type LandingVariantKey,
} from "@/components/v3/landing-e/landing-variants";
import { PRICING, REGISTER } from "@/components/v3/landing-e/routes";

/* /pricing is ISR (the plans are cached for an hour), so the server cannot
   read the query the landing's Pricing link sends here (owner, 2026-10-02:
   industry, utm_* and fbclid ride along). After paint this reads it once and
   hands it to every bare register and /pricing link on the page — the plan
   cards, the build-your-own button, the trial badge, the nav — through the
   landing's own signupHref, so a visitor who reads the prices first still
   starts the trial with the trade and the ad that brought them. Then it
   tracks the badge's clicks, with the trade from that same query. */
const query = () => Object.fromEntries(new URLSearchParams(window.location.search));
const tradeOf = (params: Record<string, string>) => resolveLandingVariant(params.industry ?? params.trade);
// The query never changes without a navigation: nothing to subscribe to.
const still = () => () => {};

export function PricingVisit() {
  const industry = useSyncExternalStore<LandingVariantKey | undefined>(still, () => tradeOf(query()), () => undefined);

  useEffect(() => {
    const params = query();
    const opts = { industry: tradeOf(params), utm: pickUtm(params), fbclid: pickFbclid(params) };
    for (const base of [REGISTER, PRICING]) {
      const href = signupHref(base, opts);
      if (href === base) continue;
      document.querySelectorAll<HTMLAnchorElement>(`.jf-lp a[href="${base}"]`).forEach((a) => {
        a.setAttribute("href", href);
      });
    }
  }, []);

  return <CtaTracker industry={industry} only={["badge"]} />;
}
