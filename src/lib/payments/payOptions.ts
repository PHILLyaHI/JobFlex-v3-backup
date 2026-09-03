// Which pay buttons a client may see for a proposal, and why not. The single
// source of truth: the portal pages render from it and the pay routes refuse
// from it, so a button can never appear that the server would then reject.
import type { PaymentConnection } from "@prisma/client";
import { PaymentConnectionStatus } from "@/lib/prismaEnums";
import type { PaymentSettings } from "@/lib/settings";
import type { StripeMode } from "@/lib/stripeMode";
import { stripeKeyFor } from "@/lib/stripeMode";
import { connectClientIdFor } from "./stripeConnect";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";

export type PayBlockReason =
  | "not_connected"
  | "disabled"
  | "charges_disabled"
  | "mode_mismatch"
  | "currency_mismatch"
  | "revoked"
  | "token_expired"
  | "not_configured";

export interface PayOptions {
  stripe: { ok: boolean; reason?: PayBlockReason; ach: boolean };
  square: { ok: boolean; reason?: PayBlockReason };
  bankTransfer: { ok: boolean; instructions: string };
  /** At least one hosted provider is usable. */
  anyHosted: boolean;
}

export function resolvePayOptions(input: {
  settings: PaymentSettings;
  stripeConn: PaymentConnection | null;
  squareConn: PaymentConnection | null;
  proposalCurrency: string;
  stripeMode: StripeMode;
}): PayOptions {
  const cur = input.proposalCurrency.toUpperCase();

  // ── Stripe ────────────────────────────────────────────────────────────
  let stripe: PayOptions["stripe"] = { ok: false, ach: false };
  const s = input.stripeConn;
  if (!input.settings.stripe) stripe = { ok: false, reason: "disabled", ach: false };
  else if (!s) stripe = { ok: false, reason: "not_connected", ach: false };
  else if (!stripeKeyFor(input.stripeMode) || !connectClientIdFor(input.stripeMode))
    stripe = { ok: false, reason: "not_configured", ach: false };
  else if (s.status === PaymentConnectionStatus.REVOKED)
    stripe = { ok: false, reason: "revoked", ach: false };
  else if (s.stripeLivemode !== (input.stripeMode === "live"))
    stripe = { ok: false, reason: "mode_mismatch", ach: false };
  else if (!s.stripeChargesEnabled || s.status === PaymentConnectionStatus.RESTRICTED)
    stripe = { ok: false, reason: "charges_disabled", ach: false };
  else if (s.currency && s.currency.toUpperCase() !== cur)
    stripe = { ok: false, reason: "currency_mismatch", ach: false };
  else stripe = { ok: true, ach: s.stripeAchEnabled };

  // ── Square ────────────────────────────────────────────────────────────
  let square: PayOptions["square"] = { ok: false };
  const q = input.squareConn;
  if (!input.settings.square) square = { ok: false, reason: "disabled" };
  else if (!q) square = { ok: false, reason: "not_connected" };
  else if (!isSecretBoxConfigured() || !q.squareAccessTokenEnc || !q.squareLocationId)
    square = { ok: false, reason: "not_configured" };
  else if (q.status === PaymentConnectionStatus.REVOKED) square = { ok: false, reason: "revoked" };
  else if (q.squareTokenExpiresAt && q.squareTokenExpiresAt.getTime() < Date.now())
    square = { ok: false, reason: "token_expired" };
  else if (q.status === PaymentConnectionStatus.RESTRICTED)
    square = { ok: false, reason: "charges_disabled" };
  else if (q.currency && q.currency.toUpperCase() !== cur)
    square = { ok: false, reason: "currency_mismatch" };
  else square = { ok: true };

  const bankTransfer = {
    ok: input.settings.bankTransfer && input.settings.bankTransferInstructions.trim().length > 0,
    instructions: input.settings.bankTransferInstructions.trim(),
  };

  return { stripe, square, bankTransfer, anyHosted: stripe.ok || square.ok };
}

export const PAY_BLOCK_COPY: Record<PayBlockReason, string> = {
  not_connected: "This payment method isn't connected yet.",
  disabled: "This payment method is switched off.",
  charges_disabled: "This account can't take payments right now.",
  mode_mismatch: "Payments are in a different mode than this connection.",
  currency_mismatch: "This account settles in a different currency.",
  revoked: "Access to this account was removed.",
  token_expired: "The connection needs to be renewed.",
  not_configured: "This payment method isn't set up on the platform.",
};
