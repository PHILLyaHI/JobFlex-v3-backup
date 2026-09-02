import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time equality for bearer tokens / secrets. A plain `===` on strings
 * returns at the first differing byte, so response time leaks how many leading
 * characters an attacker got right. Both sides are digested first so the
 * lengths always match (timingSafeEqual throws on a length mismatch, which
 * would itself be a length oracle).
 */
export function tokensEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return timingSafeEqual(hashBuf(a), hashBuf(b));
}

function hashBuf(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

// One-way hash for magic-link tokens that we only ever need to *match*, never
// re-display. Storing sha256(rawToken) means a DB-read leak yields no usable
// links — the raw token lives only in the email/URL. Used for team-invite
// tokens (mirrors the password-reset flow). NOT used for the worker-portal
// token, which is a persistent credential re-sent on every assignment and so
// must stay reconstructable.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
