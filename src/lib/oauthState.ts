// Signed OAuth `state` for the provider connect flows (Stripe Connect, Square).
// Generalises the Gmail pattern in src/lib/sdk/gmail.ts: HMAC over
// {provider, organizationId, userId, nonce, exp} with the app secret, 10-minute
// expiry. The nonce is ALSO set as an httpOnly cookie by the connect route and
// must match on callback — a state that was minted for someone else's browser
// (CSRF: attacker links their provider account to the victim's org) fails.
import crypto from "node:crypto";
import { cookies } from "next/headers";

export type OAuthProvider = "stripe" | "square";

export interface OAuthState {
  provider: OAuthProvider;
  organizationId: string;
  userId: string;
  nonce: string;
  exp: number;
}

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

export function cookieNameFor(provider: OAuthProvider): string {
  return `jf_oauth_${provider}`;
}

export function signOAuthState(input: Omit<OAuthState, "nonce" | "exp">): {
  state: string;
  nonce: string;
} {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload: OAuthState = { ...input, nonce, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return { state: `${body}.${sig}`, nonce };
}

export function verifyOAuthState(state: string | null, provider: OAuthProvider): OAuthState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
    if (p.provider !== provider || !p.organizationId || !p.userId || !p.nonce) return null;
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}

/** Set by the connect route right before redirecting to the provider. */
export async function setOAuthNonceCookie(provider: OAuthProvider, nonce: string): Promise<void> {
  const jar = await cookies();
  jar.set(cookieNameFor(provider), nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

/** Read-and-clear on callback. Returns whether the cookie matched the state. */
export async function consumeOAuthNonceCookie(
  provider: OAuthProvider,
  expectedNonce: string,
): Promise<boolean> {
  const jar = await cookies();
  const name = cookieNameFor(provider);
  const value = jar.get(name)?.value ?? "";
  jar.set(name, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  if (!value) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expectedNonce));
  } catch {
    return false;
  }
}
