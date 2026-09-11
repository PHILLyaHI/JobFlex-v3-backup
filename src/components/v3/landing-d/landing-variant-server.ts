/* Server half of the trade variant: query → props for <LandingD>. Kept apart
   from landing-variants.ts, which client components import and which must
   therefore stay free of next/headers types. */

import type { LandingDProps } from "./landing-d-page";
import { pickUtm, resolveLandingVariant } from "./landing-variants";

/** The variant this visit gets — from the URL and NOTHING ELSE (owner,
    2026-09-10). The jf_industry cookie the page writes is for the register
    form's pre-select only; it never chooses the landing.

    · `?industry=` / `?trade=` present and known → that variant.
    · present but unknown, or absent → the default page. */
export function readLandingVariant(params: Record<string, string | string[] | undefined>): LandingDProps {
  const utm = pickUtm(params);
  const variant = resolveLandingVariant(params.industry ?? params.trade);
  return { variant, explicitVariant: Boolean(variant), utm };
}
