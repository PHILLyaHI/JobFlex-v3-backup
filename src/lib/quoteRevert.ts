import { createHmac } from "node:crypto";
import { tokensEqual } from "@/lib/tokens";

// REVERT TOKENS for the public proposal portal.
//
// A homeowner who taps Accept meaning Decline (or the reverse) gets one way
// back: a "Revert" control that is shown ONLY for as long as the page stays
// open. The control needs a credential, because the portal is unauthenticated
// and the revert endpoint must not be a way for anyone holding the public link
// to un-settle a deal weeks later. So the accept and decline routes hand the
// page a signed, short-lived token describing exactly what they did, and the
// revert route accepts nothing else. The page keeps it in component state —
// never in storage — which is what makes "until the window closes" true.
//
// Stateless on purpose: no schema. HMAC over the payload with the auth secret,
// the same secret NextAuth signs sessions with, so there is no second secret to
// provision.

export type RevertClaim = {
  /** Proposal id (not the public id — that is in the URL already). */
  p: string;
  /** What was done. */
  a: "accept" | "decline";
  /** The status the proposal had BEFORE, to put it back exactly. */
  prev: string;
  /** The job the accept auto-created, if it created one, so the revert can
   *  remove it again while it is still untouched. */
  j: string | null;
  /** Expiry, epoch ms. */
  exp: number;
};

/** A day. The page forgets the token the moment it closes; this cap is only
 *  what stops a token pulled out of a devtools trace from working next month. */
const TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signRevert(claim: Omit<RevertClaim, "exp">): string {
  const full: RevertClaim = { ...claim, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The claim, or null for anything not signed by us or past its expiry. */
export function verifyRevert(token: unknown): RevertClaim | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!tokensEqual(sig, sign(body))) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RevertClaim;
    if (
      typeof claim.p !== "string" ||
      (claim.a !== "accept" && claim.a !== "decline") ||
      typeof claim.prev !== "string" ||
      (claim.j !== null && typeof claim.j !== "string") ||
      typeof claim.exp !== "number" ||
      claim.exp < Date.now()
    ) {
      return null;
    }
    return claim;
  } catch {
    return null;
  }
}
