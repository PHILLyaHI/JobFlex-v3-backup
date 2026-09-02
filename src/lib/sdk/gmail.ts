import crypto from "node:crypto";
import { IntegrationDisabledError } from "./base";
import { withEmailRetry, recipientLabel } from "./emailRetry";

// Scopes: send mail on the user's behalf + read their email address (to show
// "connected as x@gmail.com" and set the From).
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number | null;
  email: string;
}

export function isGmailOAuthConfigured() {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REDIRECT_URI,
  );
}

// Lazy dynamic import — googleapis is heavy and only needed on the Gmail paths
// (matches the rest of the codebase and stays bundle-friendly under Turbopack).
async function loadOAuth() {
  if (!isGmailOAuthConfigured()) {
    throw new IntegrationDisabledError("Gmail", "GMAIL_OAUTH_CLIENT_ID");
  }
  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    process.env.GMAIL_OAUTH_REDIRECT_URI,
  );
  return { google, oauth2 };
}

/** Build the Google consent URL. `state` must be a signed value we can verify. */
export async function getGmailAuthUrl(state: string): Promise<string> {
  const { oauth2 } = await loadOAuth();
  return oauth2.generateAuthUrl({
    access_type: "offline", // needed to receive a refresh_token
    prompt: "consent", // force refresh_token even on re-consent
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
}

/** Exchange the OAuth code for tokens + the connected Gmail address. */
export async function exchangeGmailCode(code: string): Promise<GmailTokens> {
  const { google, oauth2 } = await loadOAuth();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  const userinfo = google.oauth2({ version: "v2", auth: oauth2 });
  const { data } = await userinfo.userinfo.get();
  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    expiryDate: tokens.expiry_date ?? null,
    email: data.email ?? "",
  };
}

export async function getGmailClient(accessToken: string, refreshToken?: string) {
  const { google, oauth2 } = await loadOAuth();
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Send an HTML email through the connected Gmail account. */
export async function sendViaGmail(
  tokens: Pick<GmailTokens, "accessToken" | "refreshToken" | "email">,
  opts: { to: string; subject: string; html: string; fromName?: string; replyTo?: string },
): Promise<void> {
  // Retry transient Gmail failures (429, 5xx, network) up to 3 attempts. A
  // permanent error (401/403 revoked token) is re-thrown at once so orgSend.ts
  // can fall back to Resend quickly rather than stalling on doomed retries.
  await withEmailRetry(`gmail → ${recipientLabel(opts.to)}`, async () => {
    const gmail = await getGmailClient(tokens.accessToken, tokens.refreshToken);
    // Header values are single-line by definition: strip CR/LF so a crafted
    // address or display name cannot inject extra headers (Bcc:, etc.) into
    // the raw MIME message.
    const hv = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
    const from = opts.fromName ? `${hv(opts.fromName)} <${hv(tokens.email)}>` : hv(tokens.email);
    const headers = [
      `From: ${from}`,
      `To: ${hv(opts.to)}`,
      opts.replyTo ? `Reply-To: ${hv(opts.replyTo)}` : "",
      // RFC 2047 encode the subject so non-ASCII survives.
      `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
    ].filter(Boolean);
    const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${opts.html}`).toString("base64url");
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  });
}

// ── Signed OAuth state (CSRF + org binding) ──────────────────────────────────
// The state round-trips through Google, so it must be tamper-proof. HMAC it with
// the app secret and carry the org id + a short expiry.
interface GmailState {
  organizationId: string;
  exp: number;
}

export function signGmailState(organizationId: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  const payload: GmailState = { organizationId, exp: Date.now() + 10 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGmailState(state: string | null): GmailState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as GmailState;
    if (!payload.organizationId || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
