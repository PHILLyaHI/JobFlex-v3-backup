import nodemailer, { type Transporter } from "nodemailer";

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

// Gmail rewrites the From header to the authenticated mailbox, so a From whose
// address differs from SMTP_USER reads as a spoof to spam filters. Warn once.
function warnOnFromMismatch(from: string) {
  const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const user = (process.env.SMTP_USER ?? "").trim().toLowerCase();
  if (!mismatchWarned && user && addr && addr !== user) {
    mismatchWarned = true;
    console.warn(
      `[smtp] From <${addr}> does not match SMTP_USER <${user}> — Gmail will rewrite it. Set FROM_EMAIL to ${user} to avoid a spam-filter mismatch.`,
    );
  }
}

export async function sendViaSmtp(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}) {
  // Gmail rewrites From to the authenticated mailbox anyway, so default to it.
  const from =
    opts.from ??
    process.env.FROM_EMAIL ??
    process.env.SMTP_USER ??
    "JobFlex <app@jobflex.app>";
  warnOnFromMismatch(from);
  const info = await getTransport().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    replyTo: opts.replyTo,
  });
  return { id: info.messageId ?? "", skipped: false as const };
}
