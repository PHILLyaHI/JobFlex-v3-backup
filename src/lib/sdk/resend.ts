import { Resend } from "resend";
import { IntegrationDisabledError } from "./base";
import { isSmtpEnabled, sendViaSmtp } from "./smtp";

let client: Resend | null = null;

export function isResendEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new IntegrationDisabledError("Resend", "RESEND_API_KEY");
  }
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Unified default sender. EMAIL_FROM wins; FROM_EMAIL is the SMTP-style alias
// some environments set; otherwise the platform address.
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? process.env.FROM_EMAIL ?? "JobFlex <app@jobflex.app>";

// True when ANY transport is configured (Resend in prod, SMTP locally).
export function isEmailEnabled() {
  return isResendEnabled() || isSmtpEnabled();
}

/**
 * Send a transactional email through whichever transport is configured.
 *
 * Precedence: Resend (production — key lives on Vercel) → SMTP (local/dev, e.g.
 * a Gmail app password in .env.local) → no-op stub when neither is set.
 *
 * `replyTo` lets customer-facing mail send from the platform address while
 * routing replies back to the contractor.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}) {
  // Dev preview: when DEV_EMAIL_OVERRIDE is set, redirect every email to that one
  // inbox so you can see the design without a verified domain (Resend's test
  // sender only delivers to your own address). The original recipient is shown
  // in the subject. Never set this in production.
  const override = process.env.DEV_EMAIL_OVERRIDE?.trim();
  const to = override || opts.to;
  const subject = override
    ? `[→ ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}] ${opts.subject}`
    : opts.subject;

  if (isResendEnabled()) {
    const r = await getResend().emails.send({
      from: opts.from ?? EMAIL_FROM,
      to,
      subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    // Resend returns { data, error } — it does NOT throw. Surface the error so a
    // failed send is visible instead of silently looking like success.
    if (r.error) {
      throw new Error(r.error.message ?? r.error.name ?? "Email failed to send.");
    }
    return { id: r.data?.id ?? "", skipped: false as const };
  }
  if (isSmtpEnabled()) {
    return sendViaSmtp({ ...opts, to, subject, from: opts.from ?? EMAIL_FROM });
  }
  console.warn(
    "[email] No transport configured (set RESEND_API_KEY or SMTP_*) — would send:",
    opts.subject,
    "→",
    opts.to,
  );
  return { id: "disabled", skipped: true as const };
}
