// Guard rail for LIVE Stripe keys. Reads are always fine; this only gates
// operations that WRITE to Stripe (create coupons/products/Connect accounts,
// move money via transfers). On a live key these are refused unless the
// operator explicitly opts in with STRIPE_ALLOW_LIVE_WRITES=true — so a stray
// click in the admin UI can't touch a real account by accident.

export function isLiveStripeKey(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

export function isStripeWriteAllowed(): boolean {
  if (!isLiveStripeKey()) return true; // test mode (or no key) — writes are safe
  return process.env.STRIPE_ALLOW_LIVE_WRITES === "true";
}

export function assertStripeWriteAllowed(action: string): void {
  if (!isStripeWriteAllowed()) {
    throw new Error(
      `Refusing to ${action} against a LIVE Stripe account. ` +
        `Set STRIPE_ALLOW_LIVE_WRITES=true to enable live writes.`,
    );
  }
}
