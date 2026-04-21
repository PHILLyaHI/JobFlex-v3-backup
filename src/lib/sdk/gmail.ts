import { IntegrationDisabledError } from "./base";

export function isGmailOAuthConfigured() {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REDIRECT_URI,
  );
}

export async function getGmailClient(accessToken: string, refreshToken?: string) {
  if (!isGmailOAuthConfigured()) {
    throw new IntegrationDisabledError("Gmail", "GMAIL_OAUTH_CLIENT_ID");
  }
  const { google } = await import("googleapis");
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    process.env.GMAIL_OAUTH_REDIRECT_URI,
  );
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}
