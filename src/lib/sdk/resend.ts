import { Resend } from "resend";
import { IntegrationDisabledError } from "./base";

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

export const EMAIL_FROM = process.env.EMAIL_FROM ?? "JobFlex <hello@jobflex.app>";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  if (!isResendEnabled()) {
    console.warn("[email] Resend disabled — would send:", opts.subject, "→", opts.to);
    return { id: "disabled", skipped: true as const };
  }
  const r = await getResend().emails.send({
    from: opts.from ?? EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { id: r.data?.id ?? "", skipped: false as const };
}
