// RAILS NOT YET PROVEN BY A LIVE PAYMENT (2026-09-20).
//
// Stax was built blind — no account to run a payment against (see stax.ts) —
// and PayPal is a stub. Until the owner has watched a real payment settle on
// them, neither is offered to a contractor or shown to a client: one switch,
// read here and nowhere else, keeps the code in place and the rail off.
//
//   PAYMENTS_STAX_LIVE=true   Stax may be connected in Settings and offered
//                             on the portal. A row that already exists stays
//                             visible either way, so it can be disconnected.
//
// PayPal has no connection row, no checkout and no settings row; its
// PaymentSettings flag defaults to false and nothing renders it.

export function isStaxRailLive(): boolean {
  return process.env.PAYMENTS_STAX_LIVE === "true";
}
