import { isOpenAIEnabled } from "./openai";
import { isStripeEnabled } from "./stripe";
import { isSquareEnabled } from "./square";
import { isPayPalEnabled } from "./paypal";
import { isResendEnabled } from "./resend";
import { isTwilioEnabled } from "./twilio";
import { isGmailOAuthConfigured } from "./gmail";
import { isFalEnabled } from "./falAi";
import { isBlobEnabled } from "./blob";

export interface IntegrationStatus {
  key: string;
  name: string;
  enabled: boolean;
  envKeys: string[];
  purpose: string;
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    {
      key: "openai",
      name: "OpenAI",
      enabled: isOpenAIEnabled(),
      envKeys: ["OPENAI_API_KEY"],
      purpose: "AI proposal drafts, lead categorization, estimate generation",
    },
    {
      key: "stripe",
      name: "Stripe",
      enabled: isStripeEnabled(),
      envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      purpose: "Checkout, subscriptions, invoice payments",
    },
    {
      key: "square",
      name: "Square",
      enabled: isSquareEnabled(),
      envKeys: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
      purpose: "Alternative checkout + invoicing",
    },
    {
      key: "paypal",
      name: "PayPal",
      enabled: isPayPalEnabled(),
      envKeys: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"],
      purpose: "Alternative checkout",
    },
    {
      key: "resend",
      name: "Resend",
      enabled: isResendEnabled(),
      envKeys: ["RESEND_API_KEY"],
      purpose: "Transactional email (send proposal, reminder, thank you)",
    },
    {
      key: "twilio",
      name: "Twilio",
      enabled: isTwilioEnabled(),
      envKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
      purpose: "SMS notifications for leads, jobs, workers",
    },
    {
      key: "gmail",
      name: "Gmail OAuth",
      enabled: isGmailOAuthConfigured(),
      envKeys: ["GMAIL_OAUTH_CLIENT_ID", "GMAIL_OAUTH_CLIENT_SECRET"],
      purpose: "Send email from contractor's own Gmail account",
    },
    {
      key: "fal",
      name: "FAL.ai",
      enabled: isFalEnabled(),
      envKeys: ["FAL_KEY"],
      purpose: "Pixel-accurate roof/fence segmentation",
    },
    {
      key: "blob",
      name: "Vercel Blob",
      enabled: isBlobEnabled(),
      envKeys: ["BLOB_READ_WRITE_TOKEN"],
      purpose: "Photo + document uploads",
    },
  ];
}
