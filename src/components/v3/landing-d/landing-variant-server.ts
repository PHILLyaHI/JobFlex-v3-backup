/* Server half of the trade variant: query and cookie → props for <LandingD>.
   Kept apart from landing-variants.ts, which client components import and
   which must therefore stay free of next/headers types. */

import type { LandingDProps } from "./landing-d-page";
import { INDUSTRY_COOKIE, pickUtm, resolveLandingVariant } from "./landing-variants";

type CookieJar = { get(name: string): { value: string } | undefined };

/** The variant this visit gets, and whether the URL asked for it.

    · `?industry=` / `?trade=` present and known → that variant, remembered.
    · present but unknown → the default page; the cookie is not consulted and
      not touched (an ad with a typo must not un-remember a real visit).
    · absent → the memory cookie, if it names a known variant. */
export function readLandingVariant(
  params: Record<string, string | string[] | undefined>,
  jar: CookieJar,
): LandingDProps {
  const utm = pickUtm(params);
  const raw = params.industry ?? params.trade;
  if (raw !== undefined) {
    const variant = resolveLandingVariant(raw);
    return { variant, explicitVariant: Boolean(variant), utm };
  }
  const remembered = resolveLandingVariant(jar.get(INDUSTRY_COOKIE)?.value);
  return { variant: remembered, explicitVariant: false, utm };
}
