import nodemailer, { type Transporter } from "nodemailer";
import { withEmailRetry, recipientLabel } from "./emailRetry";

// SMTP transport — the local/dev email path (e.g. a Gmail app password) that
// stands in for Resend when no RESEND_API_KEY is present. Routed through the
// shared sendEmail() in ./resend so every existing caller works unchanged.

let transporter: Transporter | null = null;

export function isSmtpEnabled() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
  );
}

function smtpPort() {
  return Number(process.env.SMTP_PORT ?? 587);
}

function getTransport() {
  if (!transporter) {
    const port = smtpPort();
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 = implicit TLS (secure:true). 587 (Gmail default) = STARTTLS:
      // connect plaintext then upgrade — secure:false, and requireTLS forces
      // the encrypted upgrade so we never send credentials in the clear.
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      requireTLS: port !== 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

let mismatchWarned = false;

const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
const displayNameOf = (from: string) => from.match(/^\s*([^<]+?)\s*</)?.[1] ?? "";
const domainOf = (addr: string) => addr.split("@")[1] ?? "";

/**
 * Force the From address onto the authenticated mailbox when it belongs to a
 * DIFFERENT domain.
 *
 * This is the fix for invites that "send successfully" and never arrive. The
 * shared EMAIL_FROM is a platform address (and in local dev it is often the
 * Resend test sender, `onboarding@resend.dev`), while the SMTP path
 * authenticates as SMTP_USER on someone else's relay — Gmail. The relay accepts
 * the message with a 250 and puts the alien From on the wire, so at the
 * RECEIVER the envelope domain has no SPF authorisation for that relay and the
 * DKIM signature is `d=<smtp user domain>` — nothing aligns, DMARC fails, and
 * the mail is quarantined or dropped. The sender never sees a failure.
 *
 * A same-domain From is left alone: `noreply@acme.com` sent as
 * `app@acme.com` is a normal Workspace alias and stays aligned. Only a
 * cross-domain From is rewritten, and the display name ("JobFlex") is carried
 * over so nothing visible changes for the recipient.
 */
function alignFrom(from: string): string {
  const user = (process.env.SMTP_USER ?? "").trim();
  if (!user) return from;
  const addr = addressOf(from);
  const userAddr = user.toLowerCase();
  if (!addr || domainOf(addr) === domainOf(userAddr)) return from;
  if (!mismatchWarned) {
    mismatchWarned = true;
    console.warn(
      `[smtp] From <${addr}> is not on SMTP_USER's domain <${userAddr}> — sending as <${userAddr}> instead so SPF/DKIM align (set FROM_EMAIL=${user} to make this explicit).`,
    );
  }
  const name = displayNameOf(from);
  return name ? `${name} <${user}>` : user;
}

export async function sendViaSmtp(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}) {
  // Gmail rewrites From to the authenticated mailbox anyway, so default to it.
  const from = alignFrom(
    opts.from ??
      process.env.FROM_EMAIL ??
      process.env.SMTP_USER ??
      "JobFlex <app@jobflex.app>",
  );
  // Retry transient SMTP failures (4xx greylist/timeout, socket drops) up to 3
  // attempts; a 5xx (bad mailbox) or auth error is re-thrown at once.
  return withEmailRetry(`smtp → ${recipientLabel(opts.to)}`, async () => {
    const info = await getTransport().sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    return { id: info.messageId ?? "", skipped: false as const };
  });
}
