// Server-only. Sends an org's outbound email the "right" way: through the org's
// connected Gmail when they've opted in, otherwise through the platform transport
// (Resend/SMTP) with the contractor set as reply-to. Centralizes the decision so
// follow-ups (and future senders) share one code path.
import { sendEmail } from "@/lib/sdk/resend";
import { parseGmailSettings } from "@/lib/settings";
import { isGmailOAuthConfigured, sendViaGmail, type GmailTokens } from "@/lib/sdk/gmail";

export interface OrgEmailSender {
  name: string | null;
  gmailSettingsJson: string | null;
  gmailTokensJson: string | null;
  billingEmail: string | null;
}

/** Reply-to: the org's configured reply-to, else its billing email. */
export function orgReplyTo(org: {
  gmailSettingsJson: string | null;
  billingEmail: string | null;
}): string | undefined {
  const rt = parseGmailSettings(org.gmailSettingsJson).replyTo?.trim();
  return rt || org.billingEmail || undefined;
}

export async function sendOrgEmail(
  org: OrgEmailSender,
  opts: { to: string | string[]; subject: string; html: string },
): Promise<{ via: "gmail" | "resend" }> {
  const settings = parseGmailSettings(org.gmailSettingsJson);
  const replyTo = orgReplyTo(org);

  // Prefer the org's own Gmail when connected + opted in + OAuth configured.
  if (settings.connected && settings.sendFromUser && isGmailOAuthConfigured() && org.gmailTokensJson) {
    try {
      const tokens = JSON.parse(org.gmailTokensJson) as GmailTokens;
      if (tokens.refreshToken && tokens.email) {
        const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
        await sendViaGmail(tokens, {
          to,
          subject: opts.subject,
          html: opts.html,
          fromName: settings.displayName || org.name || undefined,
          replyTo,
        });
        return { via: "gmail" };
      }
    } catch (err) {
      // Never let a Gmail hiccup drop the email — fall through to the platform.
      console.warn("[sendOrgEmail] Gmail send failed, falling back to Resend:", err);
    }
  }

  await sendEmail({ to: opts.to, subject: opts.subject, html: opts.html, replyTo });
  return { via: "resend" };
}
