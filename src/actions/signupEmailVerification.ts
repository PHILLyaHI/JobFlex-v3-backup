"use server";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { enforceRateLimit, clientIp, HOUR } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/sdk/resend";
import { appBaseUrl } from "@/lib/appUrl";

const COOKIE = "jf_signup_email";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const key = (s: string) => `signup-email:${digest(s)}`;
type Verification = { email: string; expires: number; verified: boolean; sentAt: number };

export async function requestSignupEmail(rawEmail: string) {
  const email = z.string().trim().toLowerCase().email().max(254).parse(rawEmail);
  await enforceRateLimit(`signup-email:${await clientIp()}`, 5, HOUR, "verification emails");
  await enforceRateLimit(`signup-email-address:${digest(email)}`, 3, HOUR, "verification emails");
  const secret = randomBytes(32).toString("hex");
  const verification: Verification = { email, expires: Date.now() + 30 * 60_000, verified: false, sentAt: Date.now() };
  await db.syncState.create({ data: { key: key(secret), cursor: JSON.stringify(verification) } });
  const href = `${(await appBaseUrl()).replace(/\/$/, "")}/auth/register/verify?token=${secret}`;
  const delivery = await sendEmail({ to: email, subject: "Verify your email for JobFlex", html: `<p>Confirm your email to continue creating your JobFlex account.</p><p><a href="${href}">Verify email</a></p><p>This link expires in 30 minutes. If you didn't request this, ignore this email.</p>` });
  if (delivery.id === "disabled") throw new Error("Verification email is temporarily unavailable. Please try again later.");
  (await cookies()).set(COOKIE, secret, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 1800 });
  return { sent: true };
}

export async function signupEmailVerified(rawEmail: string): Promise<boolean> {
  const secret = (await cookies()).get(COOKIE)?.value;
  if (!secret) return false;
  const row = await db.syncState.findUnique({ where: { key: key(secret) } });
  if (!row) return false;
  const v = JSON.parse(row.cursor) as Verification;
  return v.verified && v.expires > Date.now() && v.email === rawEmail.trim().toLowerCase();
}

export async function verifySignupEmail(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) return { ok: false };
  const row = await db.syncState.findUnique({ where: { key: key(secret) } });
  if (!row) return { ok: false };
  const v = JSON.parse(row.cursor) as Verification;
  if (v.expires <= Date.now()) return { ok: false };
  await db.syncState.update({ where: { key: row.key }, data: { cursor: JSON.stringify({ ...v, verified: true }) } });
  return { ok: true };
}
