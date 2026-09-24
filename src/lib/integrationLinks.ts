// WHERE EACH API LIVES (2026-09-24) — pure.
//
// Owner: "in admin, where all the APIs are, add quick links to the API
// website — in case we need to change the plan or add more credits, a quick
// link instead of going to find the website." One entry per service the
// admin console lists (lib/sdk/integrations keys, plus the health card's
// keys), each with two or three doors: the console, the billing or plan
// page, and the one other page an operator opens (keys, usage, webhooks,
// docs). Only public URLs; nothing here reads a key or an account id.
// Every link was checked to answer on 2026-09-24.

export type IntegrationLink = { label: string; href: string };

const LINKS: Record<string, IntegrationLink[]> = {
  stripe: [
    { label: "Dashboard", href: "https://dashboard.stripe.com/" },
    { label: "API keys", href: "https://dashboard.stripe.com/apikeys" },
    { label: "Webhooks", href: "https://dashboard.stripe.com/webhooks" },
  ],
  "stripe-webhook": [
    { label: "Webhooks", href: "https://dashboard.stripe.com/webhooks" },
    { label: "Dashboard", href: "https://dashboard.stripe.com/" },
  ],
  "stripe-connect": [
    { label: "Connect settings", href: "https://dashboard.stripe.com/settings/connect" },
    { label: "Connected accounts", href: "https://dashboard.stripe.com/connect/accounts/overview" },
  ],
  square: [
    { label: "Developer console", href: "https://developer.squareup.com/apps" },
    { label: "Docs", href: "https://developer.squareup.com/docs" },
  ],
  resend: [
    { label: "Console", href: "https://resend.com/overview" },
    { label: "Billing", href: "https://resend.com/settings/billing" },
    { label: "API keys", href: "https://resend.com/api-keys" },
  ],
  twilio: [
    { label: "Console", href: "https://console.twilio.com/" },
    { label: "Billing & funds", href: "https://console.twilio.com/us1/billing/manage-billing/billing-overview" },
    { label: "Usage", href: "https://console.twilio.com/us1/monitor/usage" },
  ],
  gmail: [
    { label: "Credentials", href: "https://console.cloud.google.com/apis/credentials" },
    { label: "Consent screen", href: "https://console.cloud.google.com/apis/credentials/consent" },
  ],
  maps: [
    { label: "Console", href: "https://console.cloud.google.com/google/maps-apis/overview" },
    { label: "Billing", href: "https://console.cloud.google.com/billing" },
    { label: "Quotas", href: "https://console.cloud.google.com/google/maps-apis/quotas" },
  ],
  regrid: [
    { label: "Account", href: "https://app.regrid.com/" },
    { label: "Plans", href: "https://regrid.com/pricing" },
    { label: "API", href: "https://regrid.com/api" },
  ],
  reportall: [{ label: "Site", href: "https://reportallusa.com/" }],
  eagleview: [
    { label: "Developer portal", href: "https://developer.eagleview.com/" },
    { label: "Site", href: "https://www.eagleview.com/" },
  ],
  openai: [
    { label: "Console", href: "https://platform.openai.com/" },
    { label: "Billing & credits", href: "https://platform.openai.com/settings/organization/billing/overview" },
    { label: "Usage", href: "https://platform.openai.com/usage" },
  ],
  serpapi: [
    { label: "Dashboard", href: "https://serpapi.com/dashboard" },
    { label: "Plan", href: "https://serpapi.com/plan" },
    { label: "API key", href: "https://serpapi.com/manage-api-key" },
  ],
  fal: [
    { label: "Dashboard", href: "https://fal.ai/dashboard" },
    { label: "Billing", href: "https://fal.ai/dashboard/billing" },
    { label: "Keys", href: "https://fal.ai/dashboard/keys" },
  ],
  blob: [
    { label: "Storage", href: "https://vercel.com/dashboard/stores" },
    { label: "Docs", href: "https://vercel.com/docs/storage/vercel-blob" },
  ],
  posthog: [
    { label: "Console", href: "https://us.posthog.com/" },
    { label: "Billing", href: "https://us.posthog.com/organization/billing" },
  ],
  overpass: [
    { label: "Docs", href: "https://wiki.openstreetmap.org/wiki/Overpass_API" },
    { label: "Status", href: "https://overpass-api.de/" },
  ],
};

/** The health card and the integrations page name a few services differently; one set of doors for both. */
const ALIAS: Record<string, string> = {
  "square-webhook": "square",
  "square-app": "square",
  email: "resend",
  "gmail-oauth": "gmail",
  "maps-browser": "maps",
};

/** The doors for a service key; none for an internal check (payment links, payouts) or a service with no console (SMTP). */
export function integrationLinks(key: string): IntegrationLink[] {
  return LINKS[ALIAS[key] ?? key] ?? [];
}

/** Every key with doors — the QA walks them. */
export function linkedIntegrationKeys(): string[] {
  return [...Object.keys(LINKS), ...Object.keys(ALIAS)];
}
