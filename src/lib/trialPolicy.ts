// THE TRIAL'S TERMS, IN ONE PLACE (owner, 2026-10-01: a free trial with no
// card, for now — behind a flag).
//
// TRIAL_REQUIRES_CARD=true is the pay-first signup exactly as it was: the plan
// step opens Stripe Checkout, the card is taken, the plan's own trial runs
// (/api/checkout/signup → completePendingSignup). Anything else — unset, the
// default — is the card-less trial: the plan step asks for nothing, the
// address is confirmed by email, and the account starts on a 7-day trial with
// no payment method on file (lib/cardlessTrial). Read on the server only;
// pages hand the answer to their client components as a prop.

/** True when signup takes a card up front (the pay-first flow). */
export function trialRequiresCard(): boolean {
  return process.env.TRIAL_REQUIRES_CARD?.trim().toLowerCase() === "true";
}

/** The card-less trial's length. Fixed, whatever the plan's own trial says. */
export const CARDLESS_TRIAL_DAYS = 7;

/** The line every register button and plan card carries, by flag. */
export function trialLine(requiresCard: boolean): string {
  return requiresCard ? "7 days free · Cancel anytime" : "7-Day Free Trial — No Credit Card Required";
}
