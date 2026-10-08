// THE WAY A SUBSCRIPTION PAYS (owner, 2026-10-07) — what the admin pages print
// beside a subscriber: "Visa ···· 4242", "Link", "No card".
//
// Read live from Stripe on every page load and never stored: the schema has no
// column for it and the card changes in Stripe without telling us. One rule,
// in Stripe's own order of precedence when it charges an invoice:
//   1. the subscription's default_payment_method;
//   2. the customer's invoice_settings.default_payment_method;
//   3. the customer's legacy default_source (a card_/src_/ba_ object);
//   4. the customer's one attached card — only when there is exactly one.
// Steps 1–3 come off a subscriptions.list expanded with CARD_EXPAND; step 4
// needs one listPaymentMethods per customer, so it runs only for the
// customers 1–3 left empty, all at once (paymentCardsFor).
//
// Read-only: nothing here writes to Stripe or to the database.
import type Stripe from "stripe";

export type PaymentCard = {
  /** "other": a payment method that is not a card — Link, Cash App Pay, a bank. */
  kind: "card" | "other" | "none";
  /** The card brand ("Visa") or, for "other", the method's name ("Link"). */
  brand: string | null;
  last4: string | null;
  /** The one line the pages print. */
  label: string;
};

export const NO_CARD: PaymentCard = { kind: "none", brand: null, last4: null, label: "No card" };

/** The expansions subscriptions.list needs for steps 1–3. Stripe stops at four
 *  levels; the deepest here is exactly four. */
export const CARD_EXPAND = [
  "data.customer",
  "data.default_payment_method",
  "data.customer.invoice_settings.default_payment_method",
  "data.customer.default_source",
] as const;

const BRAND: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  americanexpress: "Amex",
  discover: "Discover",
  diners: "Diners Club",
  dinersclub: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
  eftpos_au: "eftpos",
  interac: "Interac",
};

const METHOD: Record<string, string> = {
  link: "Link",
  cashapp: "Cash App Pay",
  us_bank_account: "Bank account",
  sepa_debit: "SEPA Debit",
  bacs_debit: "Bacs Direct Debit",
  au_becs_debit: "BECS Direct Debit",
  acss_debit: "Pre-authorized debit",
  klarna: "Klarna",
  affirm: "Affirm",
  afterpay_clearpay: "Afterpay",
  amazon_pay: "Amazon Pay",
  paypal: "PayPal",
  revolut_pay: "Revolut Pay",
};

const DOTS = "····";

function make(kind: "card" | "other", brand: string, last4: string | null | undefined): PaymentCard {
  const l4 = last4 || null;
  return { kind, brand, last4: l4, label: l4 ? `${brand} ${DOTS} ${l4}` : brand };
}

function cardBrand(raw: string | null | undefined): string {
  const k = (raw ?? "").toLowerCase().replace(/[\s-]/g, "");
  return BRAND[k] ?? (k && k !== "unknown" ? raw!.charAt(0).toUpperCase() + raw!.slice(1) : "Card");
}

function methodName(type: string): string {
  return METHOD[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** A PaymentMethod, or null when it is only an id (the expansion was not asked for). */
function fromMethod(pm: string | Stripe.PaymentMethod | null | undefined): PaymentCard | null {
  if (!pm || typeof pm === "string") return null;
  if (pm.type === "card") return make("card", cardBrand(pm.card?.brand), pm.card?.last4);
  const last4 =
    pm.type === "us_bank_account"
      ? pm.us_bank_account?.last4
      : pm.type === "sepa_debit"
        ? pm.sepa_debit?.last4
        : pm.type === "bacs_debit"
          ? pm.bacs_debit?.last4
          : pm.type === "au_becs_debit"
            ? pm.au_becs_debit?.last4
            : pm.type === "acss_debit"
              ? pm.acss_debit?.last4
              : null;
  return make("other", methodName(pm.type), last4);
}

/** The legacy default_source: a Card (card_), a Source (src_) or a BankAccount (ba_). */
function fromSource(src: Stripe.CustomerSource | string | null | undefined): PaymentCard | null {
  if (!src || typeof src === "string") return null;
  if ("deleted" in src && src.deleted) return null;
  switch (src.object) {
    case "card":
      return make("card", cardBrand(src.brand), src.last4);
    case "bank_account":
      return make("other", "Bank account", src.last4);
    case "source": {
      if (src.type === "card" && src.card) return make("card", cardBrand(src.card.brand), src.card.last4);
      return make("other", methodName(src.type), null);
    }
    default:
      return null;
  }
}

export function expandedCustomer(sub: Stripe.Subscription): Stripe.Customer | null {
  const c = sub.customer;
  if (!c || typeof c === "string" || ("deleted" in c && c.deleted)) return null;
  return c as Stripe.Customer;
}

/**
 * How this subscription pays. `attached` is the customer's attached payment
 * methods (step 4) when they were read; leave it out and the answer rests on
 * steps 1–3.
 */
export function paymentCardOf(
  sub: Stripe.Subscription,
  customer: Stripe.Customer | Stripe.DeletedCustomer | null,
  attached?: readonly Stripe.PaymentMethod[] | null,
): PaymentCard {
  const own = fromMethod(sub.default_payment_method);
  if (own) return own;
  const cust = customer && !("deleted" in customer && customer.deleted) ? (customer as Stripe.Customer) : null;
  const invoiceDefault = fromMethod(cust?.invoice_settings?.default_payment_method);
  if (invoiceDefault) return invoiceDefault;
  const source = fromSource(cust?.default_source);
  if (source) return source;
  if (attached?.length) {
    const cards = attached.filter((pm) => pm.type === "card");
    if (cards.length === 1) return fromMethod(cards[0])!;
    // No card at all, one other method (a saved Link or bank): that is the way it pays.
    if (cards.length === 0 && attached.length === 1) return fromMethod(attached[0])!;
  }
  return NO_CARD;
}

/** How many customers step 4 asks about at once. */
const STEP4_PARALLEL = 8;

/**
 * Every subscription's way of paying, keyed by subscription id: steps 1–3 off
 * the expanded list, then ONE parallel round of listPaymentMethods for the
 * customers those left empty. null = Stripe did not answer for that customer,
 * which is not the same as "No card".
 */
export async function paymentCardsFor(
  stripe: Stripe,
  subs: readonly Stripe.Subscription[],
): Promise<{ cards: Map<string, PaymentCard | null>; lookups: number }> {
  const cards = new Map<string, PaymentCard | null>();
  const pending = new Map<string, Stripe.Subscription[]>();
  for (const sub of subs) {
    const cust = expandedCustomer(sub);
    const card = paymentCardOf(sub, cust);
    cards.set(sub.id, card);
    if (card.kind === "none" && cust) pending.set(cust.id, [...(pending.get(cust.id) ?? []), sub]);
  }
  const ids = [...pending.keys()];
  for (let i = 0; i < ids.length; i += STEP4_PARALLEL) {
    await Promise.all(
      ids.slice(i, i + STEP4_PARALLEL).map(async (id) => {
        let attached: Stripe.PaymentMethod[] | null;
        try {
          attached = (await stripe.customers.listPaymentMethods(id, { limit: 10 })).data;
        } catch {
          attached = null;
        }
        for (const sub of pending.get(id)!) {
          cards.set(sub.id, attached === null ? null : paymentCardOf(sub, expandedCustomer(sub), attached));
        }
      }),
    );
  }
  return { cards, lookups: ids.length };
}
