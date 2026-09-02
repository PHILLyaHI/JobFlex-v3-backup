"use server";

// Platform-admin sign in / sign out — the username/password door to /admin.
//
// The credential pair lives ONLY in the environment (ADMIN_USERNAME /
// ADMIN_PASSWORD — empty keys in .env.example, real values in .env.local and
// the host's secret store). Nothing here is ever hardcoded, and a missing pair
// fails closed: the door simply does not open.
//
// COMPARISON. Both fields are compared as SHA-256 digests through
// crypto.timingSafeEqual, and BOTH comparisons always run, so the response
// time cannot leak which half was wrong. (Digesting first is what makes the
// lengths equal — timingSafeEqual throws on mismatched lengths, which would
// itself be a length oracle.)
//
// RATE LIMIT. Attempts are counted in the shared (database-backed) limiter,
// keyed by client IP and by submitted username, 10 per 15-minute window each —
// the same count on every instance. The digest compare plus a long secret is
// still the real defence.
//
// ON SUCCESS the admin is upserted as a real User row (several admin actions
// write the issuer's id into foreign keys), the signed `jf_admin` cookie is set
// (see @/lib/adminAuth for the format), and the caller is redirected to /admin.

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { clientIp, rateLimitShared } from "@/lib/rateLimit";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, ADMIN_SESSION_MS, signAdminToken } from "@/lib/adminAuth";

export type AdminLoginResult = { ok: false; error: string };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** Constant-time equality of two strings via their SHA-256 digests. */
function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

const GENERIC_ERROR = "Username or password is wrong.";

export async function adminLogin(
  username: string,
  password: string,
): Promise<AdminLoginResult> {
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!u || !p) return { ok: false, error: "Enter your username and password." };

  // Cross-instance brake (DB-backed, see lib/rateLimit): attempts per client
  // IP and per submitted username, so neither a single scanner nor a spread
  // of instances can grind the credential pair.
  const ip = await clientIp();
  const [byIp, byUser] = await Promise.all([
    rateLimitShared(`admin-login:ip:${ip}`, MAX_ATTEMPTS, WINDOW_MS),
    rateLimitShared(`admin-login:user:${u.toLowerCase()}`, MAX_ATTEMPTS, WINDOW_MS),
  ]);
  if (!byIp.ok || !byUser.ok) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const envUser = process.env.ADMIN_USERNAME ?? "";
  const envPass = process.env.ADMIN_PASSWORD ?? "";
  const configured = envUser.length > 0 && envPass.length > 0;
  if (!configured) {
    console.error("[adminAuth] ADMIN_USERNAME / ADMIN_PASSWORD are not set — admin login is disabled.");
  }
  // Both compares always run; the result is folded so neither short-circuits.
  const userOk = sameSecret(u, envUser);
  const passOk = sameSecret(p, envPass);
  const ok = configured && userOk && passOk;

  if (!ok) return { ok: false, error: GENERIC_ERROR };

  // The principal row is passwordless by construction. Never ELEVATE an
  // existing row here: if someone self-registered this address before the
  // first admin login, the old upsert flipped THEIR password-bearing account
  // to platform admin. A row that carries a password (or was created by any
  // other path) fails closed and is logged for the operator.
  const email = `${envUser.toLowerCase()}@platform.jobflex.local`;
  const existingRow = await db.user.findUnique({
    where: { email },
    select: { id: true, hashedPassword: true, isPlatformAdmin: true },
  });
  if (existingRow && (existingRow.hashedPassword || !existingRow.isPlatformAdmin)) {
    console.error(
      `[adminAuth] refusing to elevate pre-existing user row for ${email} — delete or inspect it.`,
    );
    return { ok: false, error: "Admin sign in is not available. Contact the operator." };
  }
  const admin =
    existingRow ??
    (await db.user.create({
      data: { email, name: "Platform admin", isPlatformAdmin: true },
      select: { id: true },
    }));

  const expires = Date.now() + ADMIN_SESSION_MS;
  const token = signAdminToken(admin.id, expires);
  if (!token) {
    console.error("[adminAuth] NEXTAUTH_SECRET / AUTH_SECRET is not set — cannot sign the admin cookie.");
    return { ok: false, error: "Admin sign in is not configured on this server." };
  }

  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });

  redirect("/admin" as Route);
}

/** Clear the admin cookie and return to the admin sign-in page. */
export async function adminLogout(): Promise<never> {
  (await cookies()).set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  redirect("/admin/login" as Route);
}
