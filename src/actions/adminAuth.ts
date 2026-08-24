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
// RATE LIMIT. An in-memory map of failed attempts, keyed by client IP and by
// submitted username, 10 failures per 15-minute window each. It is
// PER-INSTANCE: on a multi-instance host each instance keeps its own count, so
// treat it as a brake on casual guessing, not a hard cap. The digest compare
// plus a long secret is the real defence.
//
// ON SUCCESS the admin is upserted as a real User row (several admin actions
// write the issuer's id into foreign keys), the signed `jf_admin` cookie is set
// (see @/lib/adminAuth for the format), and the caller is redirected to /admin.

import { createHash, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, ADMIN_SESSION_MS, signAdminToken } from "@/lib/adminAuth";

export type AdminLoginResult = { ok: false; error: string };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

type Bucket = { count: number; resetAt: number };
const failures = new Map<string, Bucket>();

function bucketFor(key: string, now: number): Bucket {
  const b = failures.get(key);
  if (b && b.resetAt > now) return b;
  const fresh = { count: 0, resetAt: now + WINDOW_MS };
  failures.set(key, fresh);
  return fresh;
}

function prune(now: number) {
  // Opportunistic sweep so the map cannot grow without bound under a scan.
  if (failures.size < 500) return;
  for (const [k, b] of failures) if (b.resetAt <= now) failures.delete(k);
}

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim() || "unknown";
    return h.get("x-real-ip") ?? "local";
  } catch {
    return "local";
  }
}

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

  const now = Date.now();
  prune(now);
  const ip = await clientIp();
  const ipBucket = bucketFor(`ip:${ip}`, now);
  const userBucket = bucketFor(`user:${u.toLowerCase()}`, now);
  if (ipBucket.count >= MAX_FAILURES || userBucket.count >= MAX_FAILURES) {
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

  if (!ok) {
    ipBucket.count += 1;
    userBucket.count += 1;
    return { ok: false, error: GENERIC_ERROR };
  }

  // Success: clear the brake for this pair and mint the principal.
  failures.delete(`ip:${ip}`);
  failures.delete(`user:${u.toLowerCase()}`);

  const email = `${envUser.toLowerCase()}@platform.jobflex.local`;
  const admin = await db.user.upsert({
    where: { email },
    update: { isPlatformAdmin: true, name: "Platform admin" },
    create: { email, name: "Platform admin", isPlatformAdmin: true },
    select: { id: true },
  });

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
