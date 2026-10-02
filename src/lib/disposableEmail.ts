// THROWAWAY MAILBOXES CANNOT SIGN UP (owner, 2026-10-02).
//
// A free trial with no card is worth taking twice, and an inbox that lives
// ten minutes is the cheapest way to do it: the confirmation link is opened,
// the mailbox is gone, and the next trial comes from the next one. So an
// address on a disposable-mail domain is refused where an address is first
// given — step 1 of the signup (checkEmailAvailable), the parked intent
// (startPendingSignup), the trial request, and a new Google identity (the auth
// callback and One Tap) — with one sentence that says what to do instead.
//
// THE LIST is the community-maintained one (lib/disposableDomains, refreshed
// by scripts/maintenance/update-disposable-domains.mjs; source and date in
// its header). A domain matches itself and every subdomain under it, so
// x.mailinator.com is mailinator.com. EXTRA_BLOCKED and ALLOWED below are
// ours: a service the list has not caught yet, or one it caught wrongly.
import "server-only";
import { DISPOSABLE_DOMAINS } from "@/lib/disposableDomains";

/** Throwaway services seen in our own signups before the list caught them. */
const EXTRA_BLOCKED: readonly string[] = [];

/** Listed domains a real contractor turned out to use. Wins over both lists. */
const ALLOWED: readonly string[] = [];

/** What the visitor reads. */
export const DISPOSABLE_EMAIL_MESSAGE =
  "That looks like a temporary email address. Use your work or personal email — the trial's confirmation and your invoices go there.";

let blocked: Set<string> | null = null;
function list(): Set<string> {
  if (!blocked) {
    blocked = new Set(DISPOSABLE_DOMAINS.split("\n").map((d) => d.trim()).filter(Boolean));
    for (const d of EXTRA_BLOCKED) blocked.add(d);
    for (const d of ALLOWED) blocked.delete(d);
  }
  return blocked;
}

/** True when the address's domain, or any domain above it, is a throwaway-mail service. */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop()?.replace(/\.$/, "") ?? "";
  if (!domain || !domain.includes(".")) return false;
  const labels = domain.split(".");
  const set = list();
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
