// Platform-admin cookie session — the username/password door to /admin.
//
// WHY A SECOND SESSION. The (admin) console used to ride on a NextAuth session
// plus the User.isPlatformAdmin flag, which meant the platform operator had to
// exist as an org user with a password in the app's own table. The operator's
// credentials now live in the environment (ADMIN_USERNAME / ADMIN_PASSWORD —
// see src/actions/adminAuth.ts for the check) and this module owns the cookie
// that proves the check passed.
//
// THE COOKIE. `jf_admin` = `${userId}.${expires}.${hmac}` where
//   hmac = HMAC-SHA256( `${userId}.${expires}`, NEXTAUTH_SECRET ?? AUTH_SECRET )
// `expires` is a unix-millisecond timestamp seven days out. The cookie is
// httpOnly, sameSite=lax, secure in production, path=/.
//
// THE PRINCIPAL IS A REAL ROW. The admin is still a User (upserted at login
// with isPlatformAdmin=true) because several admin actions write its `.id`
// into foreign keys (ticket replies, payout approvals). readAdminCookie()
// therefore returns the live row, and re-checks the flag on every call so
// flipping it off revokes access at once — the same rule requirePlatformAdmin
// already applied to the NextAuth path.
//
// SERVER ONLY. `next/headers` and Prisma both refuse to run on the client; the
// `server-only` marker package is not installed in this repo, so that is the
// whole guard. Never import this from a "use client" file.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ADMIN_COOKIE = "jf_admin";
/** Seven days, matching NextAuth's own session maxAge. */
export const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminPrincipal = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
};

function signingSecret(): string | null {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? null;
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Build the cookie value for `userId`, valid until `expires` (unix ms). */
export function signAdminToken(userId: string, expires: number): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  const payload = `${userId}.${expires}`;
  return `${payload}.${hmac(payload, secret)}`;
}

/**
 * Verify signature + expiry. Returns the embedded user id, or null for any
 * malformed, tampered, or expired token. Constant-time on the signature.
 */
export function verifyAdminToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const secret = signingSecret();
  if (!secret) return null;
  // userId is a cuid (no dots), expires is digits, sig is hex — so a split on
  // "." yields exactly three parts for a well-formed token.
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, sig] = parts;
  if (!userId || !/^\d+$/.test(expiresRaw) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  const expected = hmac(`${userId}.${expiresRaw}`, secret);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

/**
 * The admin principal behind the request's `jf_admin` cookie, or null when
 * there is no cookie, the signature/expiry fails, the row is gone, or the
 * row's isPlatformAdmin flag has since been cleared.
 */
export async function readAdminCookie(): Promise<AdminPrincipal | null> {
  let raw: string | undefined;
  try {
    raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  } catch {
    // Outside a request scope (build-time render, unit context): no cookie.
    return null;
  }
  const userId = verifyAdminToken(raw);
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isPlatformAdmin: true },
  });
  if (!user?.isPlatformAdmin) return null;
  return user;
}
