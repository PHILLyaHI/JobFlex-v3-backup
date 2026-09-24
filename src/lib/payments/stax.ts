// Stax (formerly Fattmerchant) — the contractor's merchant API key, pasted in
// Settings and kept encrypted at rest. Every call is a plain fetch against the
// documented REST API (docs.staxpayments.com); a checkout is a Stax INVOICE
// the client pays on Stax's hosted bill page. No platform relationship: no
// fee inside the payment — JobFlex's cut is billed on the JobFlex invoice
// (feeBilling.ts). Sandbox and live are separate Stax merchants behind the
// same API, so a key names its own environment.
//
// BUILT BLIND (2026-09-13): no Stax account was available to run a payment
// against. Field names follow the docs; the first real payment is the test.
import crypto from "node:crypto";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { credentialErrorMessage } from "./credentialErrors";

const BASE = "https://apiprod.fattlabs.com";
/** The hosted bill page; the invoice id is appended. */
export const STAX_BILL_URL = "https://app.staxpayments.com/#/bill/";

export class StaxError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "StaxError";
  }
}

async function staxFetch<T>(key: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new StaxError(credentialErrorMessage("Stax", { status: res.status }), res.status);
  return json as T;
}

/** Do not expose provider bodies, which may echo a key or webhook URL. */
export function staxErrorMessage(err: unknown): string {
  return credentialErrorMessage("Stax", err);
}

export interface StaxConnectionLike {
  staxApiKeyEnc: string | null;
  staxMerchantId: string | null;
  staxWebhookIds?: string | null;
}

/** The decrypted key, or null when it cannot be read (TOKEN_ENCRYPTION_KEY
 *  missing or rotated). */
export function staxKeyFor(conn: StaxConnectionLike): string | null {
  if (!conn.staxApiKeyEnc) return null;
  try {
    return decryptSecret(conn.staxApiKeyEnc);
  } catch (err) {
    console.warn("[stax] cannot decrypt key for", conn.staxMerchantId, staxErrorMessage(err));
    return null;
  }
}

export function staxWebhookIdsOf(conn: Pick<StaxConnectionLike, "staxWebhookIds">): string[] {
  try {
    const v = JSON.parse(conn.staxWebhookIds ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ── Identity ─────────────────────────────────────────────────────────────

interface StaxSelf {
  id?: string;
  merchant?: {
    id?: string;
    company_name?: string | null;
    status?: string | null;
    currency?: string[] | string | null;
  } | null;
}

export interface ValidatedStaxKey {
  key: string;
  last4: string;
  merchantId: string;
  merchantName: string | null;
  currency: string | null;
  status: string | null;
}

/** Ask Stax whose key this is (GET /self carries the merchant). */
export async function validateStaxKey(
  raw: string,
): Promise<{ ok: true; account: ValidatedStaxKey } | { ok: false; message: string }> {
  const key = raw.trim();
  if (key.length < 20 || /\s/.test(key)) {
    return { ok: false, message: "That doesn't look like a Stax API key — copy the whole key from Stax Pay → Apps → API Keys." };
  }
  try {
    const self = await staxFetch<StaxSelf>(key, "/self");
    const m = self.merchant;
    if (!m?.id) return { ok: false, message: "Stax returned no merchant for this key." };
    const currency = Array.isArray(m.currency) ? (m.currency[0] ?? null) : (m.currency ?? null);
    return {
      ok: true,
      account: {
        key,
        last4: key.slice(-4),
        merchantId: m.id,
        merchantName: m.company_name ?? null,
        currency: currency ? String(currency).toUpperCase() : null,
        status: m.status ?? null,
      },
    };
  } catch (err) {
    return { ok: false, message: staxErrorMessage(err) };
  }
}

// ── Webhooks ─────────────────────────────────────────────────────────────

/** One Stax webhook per event. update_invoice fires when the client pays
 *  (status PAID); create_transaction carries refunds (type "refund"). */
export const STAX_WEBHOOK_EVENTS = ["update_invoice", "create_transaction"] as const;

interface StaxWebhook {
  id?: string;
  url?: string;
  event?: string;
}

/** Register our endpoint (secret in the query string — Stax signs nothing)
 *  once per event. Fails soft. */
export async function registerStaxWebhooks(
  key: string,
  targetUrl: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; message: string; ids: string[] }> {
  const ids: string[] = [];
  for (const event of STAX_WEBHOOK_EVENTS) {
    try {
      const hook = await staxFetch<StaxWebhook>(key, "/webhook", {
        method: "POST",
        body: { target_url: targetUrl, event_name: event },
      });
      if (hook.id) ids.push(hook.id);
    } catch (err) {
      return { ok: false, message: staxErrorMessage(err), ids };
    }
  }
  return { ok: true, ids };
}

export async function removeStaxWebhooks(key: string, ids: string[]): Promise<boolean> {
  let all = true;
  for (const id of ids) {
    try {
      await staxFetch(key, `/webhook/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      all = false;
      console.warn("[stax] webhook removal failed", id, staxErrorMessage(err));
    }
  }
  return all;
}

/** A random secret carried in the webhook target URL — the only proof a
 *  POST came from the registration we made (payloads are unsigned). */
export function newStaxWebhookSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function staxWebhookUrl(appUrl: string, connectionId: string, secret: string): string {
  return `${appUrl}/api/webhooks/stax/${connectionId}?k=${encodeURIComponent(secret)}`;
}

// ── Invoices (the checkout) ──────────────────────────────────────────────

export interface StaxTransaction {
  id?: string;
  type?: string; // charge | refund | void | …
  success?: boolean;
  total?: number;
  method?: string; // card | bank
  reference_id?: string | null;
  invoice_id?: string | null;
  total_refunded?: number;
  is_refundable?: boolean;
  created_at?: string;
}

export interface StaxInvoice {
  id: string;
  status?: string; // DRAFT | SENT | VIEWED | PAID | PARTIALLY_APPLIED | …
  total?: number;
  total_paid?: number;
  balance_due?: number;
  paid_at?: string | null;
  deleted_at?: string | null;
  customer_id?: string | null;
  merchant_id?: string | null;
  child_transactions?: StaxTransaction[];
  meta?: unknown;
}

interface StaxCustomer {
  id?: string;
}

const money = (minor: number) => Math.round(minor) / 100;

/** Mint the invoice the client pays: a customer record (Stax needs one on the
 *  hosted page), then an invoice with one line and the amount, not sent by
 *  Stax — the portal hands the client the bill URL itself. */
export async function createStaxInvoice(
  key: string,
  input: { clientEmail: string | null; clientName: string | null; itemName: string; memo: string; amountMinor: number },
): Promise<{ id: string; payUrl: string }> {
  const name = (input.clientName ?? "").trim();
  const [firstname, ...rest] = name.split(/\s+/).filter(Boolean);
  const customer = await staxFetch<StaxCustomer>(key, "/customer", {
    method: "POST",
    body: {
      ...(input.clientEmail ? { email: input.clientEmail } : {}),
      ...(firstname ? { firstname, lastname: rest.join(" ") || undefined } : {}),
      ...(!input.clientEmail && !firstname ? { company: "Client" } : {}),
      allow_invoice_credit_card_payments: true,
    },
  });
  if (!customer.id) throw new StaxError("Stax returned no customer id", 500);
  const dollars = money(input.amountMinor);
  const invoice = await staxFetch<StaxInvoice>(key, "/invoice", {
    method: "POST",
    body: {
      customer_id: customer.id,
      total: dollars,
      url: STAX_BILL_URL,
      send_now: false,
      meta: {
        subtotal: dollars,
        tax: 0,
        memo: input.memo,
        lineItems: [{ item: input.itemName, details: input.memo, quantity: 1, price: dollars }],
      },
    },
  });
  if (!invoice.id) throw new StaxError("Stax returned no invoice id", 500);
  return { id: invoice.id, payUrl: STAX_BILL_URL + invoice.id };
}

export async function getStaxInvoice(key: string, id: string): Promise<StaxInvoice> {
  return staxFetch<StaxInvoice>(key, `/invoice/${encodeURIComponent(id)}`);
}

export async function getStaxTransaction(key: string, id: string): Promise<StaxTransaction> {
  return staxFetch<StaxTransaction>(key, `/transaction/${encodeURIComponent(id)}`);
}

/** Delete an unpaid invoice we minted (schedule changed / disconnect). */
export async function deleteStaxInvoice(key: string, id: string): Promise<"deleted" | "paid" | "gone" | "unavailable"> {
  try {
    const inv = await getStaxInvoice(key, id);
    if (inv.status === "PAID") return "paid";
    await staxFetch(key, `/invoice/${encodeURIComponent(id)}`, { method: "DELETE" });
    return "deleted";
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return "gone";
    console.warn("[stax] invoice delete failed", id, staxErrorMessage(err));
    return "unavailable";
  }
}

/** The successful charge on a paid invoice, for refunds to key on. */
export function staxChargeOf(inv: StaxInvoice): StaxTransaction | null {
  return inv.child_transactions?.find((t) => (t.type ?? "charge") === "charge" && t.success !== false) ?? null;
}

export function staxMethodWord(method: string | undefined): string {
  return method === "bank" ? "us_bank_account" : "card";
}
