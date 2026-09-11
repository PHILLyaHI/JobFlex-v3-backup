// MOBILE · Create account — /mobile-v1/auth/register
//
// RETIRED (2026-09-11). This preview URL mounted the handheld register build,
// which is the PRE-PAYWALL flow: it created the account at the end of step 2
// through `registerAccount`, with no plan step and no Stripe checkout. The
// phone login page still linked its "Create account" to this URL, so a real
// contractor (Allerton Renovations, 2026-09-09) signed up from a phone and
// never saw a plan. /auth/register serves the paywalled blueprint build at
// every width, so this URL simply sends people there now.
import { redirect } from "next/navigation";

export default function MobileRegisterPage() {
  redirect("/auth/register");
}
