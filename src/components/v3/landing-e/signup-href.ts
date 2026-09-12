import { withVariant } from "@/lib/signupVariant";
import { signupHref, type LandingVariantKey, type UtmParams } from "./landing-variants";

/** landing-d's register link plus `v=e` (pass A): the register page, the
 *  signup and the analytics read the variant from it. */
export function signupHrefE(base: string, opts: { industry?: LandingVariantKey; utm?: UtmParams }): string {
  return withVariant(signupHref(base, opts), "e");
}
