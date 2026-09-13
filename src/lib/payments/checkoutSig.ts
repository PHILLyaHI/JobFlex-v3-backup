// The server signs every hosted checkout it mints — proposal, stages, amount,
// schedule version — so a webhook can tell OUR session from one a contractor
// minted on their own account with look-alike metadata (they hold the
// account, and on the paste-a-key path the key itself). Stripe's signature
// proves an event came from Stripe; this proves the session came from us.
// The app secret is the HMAC key, as for the OAuth state and quote-revert links.
import crypto from "node:crypto";

export interface CheckoutSigFields {
  proposalId: string;
  installmentIds: string[];
  amountMinor: number;
  scheduleVersion: number;
}

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function body(f: CheckoutSigFields): string {
  return [
    "jf-checkout-v1",
    f.proposalId,
    [...f.installmentIds].sort().join(","),
    String(f.amountMinor),
    String(f.scheduleVersion),
  ].join("|");
}

export function signCheckout(f: CheckoutSigFields): string {
  return crypto.createHmac("sha256", secret()).update(body(f)).digest("base64url");
}

/** False for a missing / forged signature — and, defensively, when the app
 *  has no secret at all (nothing could have been signed). */
export function verifyCheckoutSig(sig: string | null | undefined, f: CheckoutSigFields): boolean {
  if (!sig || !secret()) return false;
  const expected = signCheckout(f);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
