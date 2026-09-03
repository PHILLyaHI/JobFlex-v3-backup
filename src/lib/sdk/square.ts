// Square as a PLATFORM app (OAuth). The app itself never charges anyone —
// every money call runs on a SELLER's access token (PaymentConnection row,
// decrypted at call time). What lives here: the app-level config, the two
// client factories, and the environment switch. See src/lib/payments/
// squareConnect.ts for the OAuth + payment-link helpers.
import { IntegrationDisabledError } from "./base";

export type SquareEnv = "sandbox" | "production";

export function squareEnv(): SquareEnv {
  return process.env.SQUARE_ENV === "production" ? "production" : "sandbox";
}

/** App credentials present — OAuth connect can start. */
export function isSquareEnabled() {
  return Boolean(process.env.SQUARE_APPLICATION_ID && process.env.SQUARE_APPLICATION_SECRET);
}

export function isSquareWebhookConfigured() {
  return Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
}

export function squareAppCredentials(): { clientId: string; clientSecret: string } {
  if (!isSquareEnabled()) {
    throw new IntegrationDisabledError("Square", "SQUARE_APPLICATION_ID");
  }
  return {
    clientId: process.env.SQUARE_APPLICATION_ID!,
    clientSecret: process.env.SQUARE_APPLICATION_SECRET!,
  };
}

/** Base for the hosted OAuth authorize page + the raw REST calls. */
export function squareConnectBase(): string {
  return squareEnv() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

/** SDK client bound to ONE seller's access token. Dynamic import — the
 *  `square` package is heavy and only the payment paths need it. */
export async function squareClientForToken(accessToken: string) {
  const { SquareClient, SquareEnvironment } = await import("square");
  return new SquareClient({
    token: accessToken,
    environment:
      squareEnv() === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}
