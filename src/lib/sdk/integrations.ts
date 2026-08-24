// Platform integrations — the ONE list /admin/integrations and /admin/health
// read from.
//
// `enabled` means exactly one thing: the env keys listed on the entry are
// present in this environment. It is NOT a reachability claim — nothing in
// getIntegrationStatuses() opens a socket. Two services can be verified for
// real, and only those two: Stripe through checkStripeReachable() below, and
// PostHog through getTrafficSnapshot() in lib/posthog (a real HogQL POST).
// Entries carrying a `probe` are the ones the admin pages may label "Live";
// everything else is reported as "configured" and nothing stronger.

import { isOpenAIEnabled } from "./openai";
import { getStripe, isStripeEnabled } from "./stripe";
import { isSquareEnabled } from "./square";
import { isPayPalEnabled } from "./paypal";
import { isResendEnabled } from "./resend";
import { isSmtpEnabled } from "./smtp";
import { isTwilioEnabled } from "./twilio";
import { isGmailOAuthConfigured } from "./gmail";
import { isFalEnabled } from "./falAi";
import { isBlobEnabled } from "./blob";
import { isRegridEnabled } from "../parcel";
import { isReportAllEnabled } from "../reportall";
import { isEagleViewEnabled } from "../eagleview";
import { isMapsEnabled } from "../maps";
import { isPostHogEnabled } from "../posthog";

export type IntegrationGroup = "payments" | "messaging" | "property" | "platform";

/** The services a live check exists for. Anything else can only be "configured". */
export type LiveProbe = "stripe" | "posthog";

export interface IntegrationStatus {
  key: string;
  name: string;
  group: IntegrationGroup;
  /** The env keys on this entry are all present. Never a reachability claim. */
  enabled: boolean;
  envKeys: string[];
  probe?: LiveProbe;
}

export function isSerpApiEnabled(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY);
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isMapsBrowserKeySet(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY);
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    // ── Payments ──────────────────────────────────────────────────────────
    {
      key: "stripe",
      name: "Stripe",
      group: "payments",
      enabled: isStripeEnabled(),
      envKeys: ["STRIPE_SECRET_KEY"],
      probe: "stripe",
    },
    {
      key: "stripe-webhook",
      name: "Stripe webhooks",
      group: "payments",
      enabled: isStripeWebhookConfigured(),
      envKeys: ["STRIPE_WEBHOOK_SECRET"],
    },
    {
      key: "square",
      name: "Square",
      group: "payments",
      enabled: isSquareEnabled(),
      envKeys: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
    },
    {
      key: "paypal",
      name: "PayPal",
      group: "payments",
      enabled: isPayPalEnabled(),
      envKeys: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
    },

    // ── Email & SMS ───────────────────────────────────────────────────────
    {
      key: "resend",
      name: "Resend",
      group: "messaging",
      enabled: isResendEnabled(),
      envKeys: ["RESEND_API_KEY"],
    },
    {
      key: "smtp",
      name: "SMTP",
      group: "messaging",
      enabled: isSmtpEnabled(),
      envKeys: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
    },
    {
      key: "twilio",
      name: "Twilio",
      group: "messaging",
      enabled: isTwilioEnabled(),
      envKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    },
    {
      key: "gmail",
      name: "Gmail OAuth",
      group: "messaging",
      enabled: isGmailOAuthConfigured(),
      envKeys: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET", "GMAIL_OAUTH_REDIRECT_URI"],
    },

    // ── Property data ─────────────────────────────────────────────────────
    {
      key: "maps",
      name: "Google Maps",
      group: "property",
      enabled: isMapsEnabled(),
      envKeys: ["GOOGLE_MAPS_API_KEY"],
    },
    {
      key: "maps-browser",
      name: "Google Maps · browser",
      group: "property",
      enabled: isMapsBrowserKeySet(),
      envKeys: ["NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY"],
    },
    {
      key: "regrid",
      name: "Regrid",
      group: "property",
      enabled: isRegridEnabled(),
      envKeys: ["REGRID_API_KEY"],
    },
    {
      key: "reportall",
      name: "ReportAll USA",
      group: "property",
      enabled: isReportAllEnabled(),
      envKeys: ["REPORTALL_CLIENT_KEY"],
    },
    {
      key: "eagleview",
      name: "EagleView",
      group: "property",
      enabled: isEagleViewEnabled(),
      envKeys: ["EAGLEVIEW_CLIENT_ID", "EAGLEVIEW_CLIENT_SECRET"],
    },

    // ── Platform ──────────────────────────────────────────────────────────
    {
      key: "openai",
      name: "OpenAI",
      group: "platform",
      enabled: isOpenAIEnabled(),
      envKeys: ["OPENAI_API_KEY"],
    },
    {
      key: "serpapi",
      name: "SerpAPI",
      group: "platform",
      enabled: isSerpApiEnabled(),
      envKeys: ["SERPAPI_API_KEY"],
    },
    {
      key: "fal",
      name: "FAL.ai",
      group: "platform",
      enabled: isFalEnabled(),
      envKeys: ["FAL_KEY"],
    },
    {
      key: "blob",
      name: "Vercel Blob",
      group: "platform",
      enabled: isBlobEnabled(),
      envKeys: ["BLOB_READ_WRITE_TOKEN"],
    },
    {
      key: "posthog",
      name: "PostHog",
      group: "platform",
      enabled: isPostHogEnabled(),
      envKeys: ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"],
      probe: "posthog",
    },
  ];
}

export type LiveCheck =
  | { state: "off" }
  | { state: "ok" }
  | { state: "error"; message: string };

/**
 * A real authenticated round trip to Stripe. `balance.retrieve` is a READ, so
 * it is safe against a live key (stripeSafety only gates writes), and it is the
 * cheapest call that proves the secret key is accepted. No retries: this is a
 * health probe, and a retry would report a reachability the first attempt did
 * not have.
 */
export async function checkStripeReachable(): Promise<LiveCheck> {
  if (!isStripeEnabled()) return { state: "off" };
  try {
    await getStripe().balance.retrieve(undefined, { timeout: 6000, maxNetworkRetries: 0 });
    return { state: "ok" };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : "Stripe did not answer" };
  }
}
