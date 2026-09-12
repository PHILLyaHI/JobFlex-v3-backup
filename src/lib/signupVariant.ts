/* THE LANDING TEST VARIANT (landing-e pass A, 2026-09-11).

   landing-e adds `v=e` to every register link and writes a 30-day cookie; the
   register page, the pending signup, the organization, the first run on the
   Overview, the welcome email and the analytics all read it from here.
   Without the parameter or the cookie nothing anywhere changes. */

export const VARIANT_COOKIE = "jf_variant";
export const VARIANT_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export type SignupVariant = "e";

export function parseSignupVariant(v: unknown): SignupVariant | null {
  return v === "e" ? "e" : null;
}

/** `href` with `v=<variant>` appended; unchanged when there is no variant. */
export function withVariant(href: string, variant: SignupVariant | null | undefined): string {
  if (!variant) return href;
  return href + (href.includes("?") ? "&" : "?") + "v=" + variant;
}
