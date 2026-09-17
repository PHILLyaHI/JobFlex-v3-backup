/* Meta Conversions API, server half (2026-09-09). Every browser event has a
   server copy with the same event_id, so Meta deduplicates the pair; the
   server copy is also the one that survives ad blockers. Sends nothing
   unless NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_ACCESS_TOKEN are both set;
   META_TEST_EVENT_CODE routes events to Events Manager's Test Events tab.

   CONSENT (lib/consent). With marketing consent the event carries fbp/fbc,
   the client IP and the user agent. Without it the event still goes — as a
   server-side conversion record, with the hashed email/phone only. Never a
   raw address: email and phone are SHA-256 hashed, normalised the way Meta
   asks (trimmed, lower-cased; phone as digits with the country code). */

import { createHash } from "node:crypto";

const GRAPH_VERSION = "v21.0";

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  /** Meta's own cookies, only with marketing consent. */
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Our stable id for the person (organization id), hashed like the rest. */
  externalId?: string | null;
}

export interface MetaEvent {
  eventName: "PageView" | "InitiateCheckout" | "CompleteRegistration" | "StartTrial" | "Purchase";
  eventId: string;
  /** Unix seconds; now when absent. */
  eventTime?: number;
  sourceUrl?: string | null;
  user: MetaUserData;
  /** industry, plan, utm_* … */
  custom?: Record<string, string | number | null | undefined>;
  value?: number;
  currency?: string;
  /** True when the browser could also have fired this event (consent), for the report only. */
  consent: boolean;
}

export const isMetaCapiConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() && process.env.META_CAPI_ACCESS_TOKEN?.trim());

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function hashEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e ? sha256(e) : null;
}

/** Digits only, with a country code; a bare 10-digit US number gets "1". */
export function hashPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  const withCountry = digits.length === 10 ? "1" + digits : digits;
  return withCountry.length >= 11 ? sha256(withCountry) : null;
}

/** The request body, built once so a debug log and the send are the same bytes. */
export function buildMetaPayload(e: MetaEvent): Record<string, unknown> {
  const em = hashEmail(e.user.email);
  const ph = hashPhone(e.user.phone);
  const userData: Record<string, unknown> = {};
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (e.user.externalId) userData.external_id = [sha256(e.user.externalId)];
  if (e.consent) {
    if (e.user.fbp) userData.fbp = e.user.fbp;
    if (e.user.fbc) userData.fbc = e.user.fbc;
    if (e.user.clientIp) userData.client_ip_address = e.user.clientIp;
    if (e.user.userAgent) userData.client_user_agent = e.user.userAgent;
  }
  const custom: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.custom ?? {})) if (v !== null && v !== undefined && v !== "") custom[k] = v;
  if (e.value != null) custom.value = e.value;
  if (e.currency) custom.currency = e.currency;
  const data: Record<string, unknown> = {
    event_name: e.eventName,
    event_time: e.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: e.eventId,
    action_source: "website",
    user_data: userData,
    ...(Object.keys(custom).length ? { custom_data: custom } : {}),
    ...(e.sourceUrl ? { event_source_url: e.sourceUrl } : {}),
  };
  const body: Record<string, unknown> = { data: [data] };
  const test = process.env.META_TEST_EVENT_CODE?.trim();
  if (test) body.test_event_code = test;
  return body;
}

/** Fire and forget; never throws. Returns true when a send was attempted. */
export async function sendMetaEvent(e: MetaEvent): Promise<boolean> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  const body = buildMetaPayload(e);
  if (process.env.META_CAPI_DEBUG === "true") {
    console.info("[meta:capi]", e.eventName, JSON.stringify(body));
  }
  if (!pixel || !token) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) console.warn("[meta:capi] rejected", e.eventName, res.status, (await res.text().catch(() => "")).slice(0, 200));
    return true;
  } catch (err) {
    console.warn("[meta:capi] unavailable", e.eventName, err instanceof Error ? err.message : String(err));
    return true;
  }
}

/* ── what the signup remembers for the events that come later ── */

/** Written on the organization at creation (Organization.metaSignupJson) so
 *  the Stripe webhook's StartTrial / Purchase carry the same person. */
export interface MetaSignupContext {
  consent: boolean;
  registrationEventId: string;
  checkoutEventId?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
  /** Set once the first Purchase has gone, so renewals do not repeat it. */
  purchaseSentAt?: string;
  trialSentAt?: string;
}

export function parseMetaSignup(json: string | null | undefined): MetaSignupContext | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as MetaSignupContext;
    return v && typeof v === "object" && typeof v.registrationEventId === "string" ? v : null;
  } catch {
    return null;
  }
}
