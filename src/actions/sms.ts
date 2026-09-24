"use server";

// TEXT MESSAGES — the office's settings (2026-09-24).
//
// A member verifies a mobile with a six-digit code (the code is the
// consent); a manager adds extra office numbers (each gets a welcome text
// with the STOP line) and can pause or drop them; anyone can text
// themselves a test. JobFlex owns the Twilio account, so none of this
// touches a key — only phone numbers. docs/sms.md.

import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager, requireOrg } from "@/lib/orgContext";
import { toE164 } from "@/lib/phone";
import { enforceRateLimit, HOUR, RateLimitError } from "@/lib/rateLimit";
import { isTwilioEnabled } from "@/lib/sdk/twilio";
import { testText, verifyText, welcomeText } from "@/lib/sms/format";
import { sendText } from "@/lib/sms/send";

const SETTINGS_PATH = "/dashboard/settings";
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_EXTRA_NUMBERS = 10;

export type SmsActionResult = { ok: true; note?: string } | { ok: false; error: string };

function hashCode(code: string, userId: string): string {
  return createHash("sha256").update(`${code}:${userId}`).digest("hex");
}

/** "(206) 555-0100" for a saved E.164 number. */
function pretty(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}

/** Step one: text a code to the number the member typed. */
export async function startPhoneVerification(raw: string): Promise<SmsActionResult> {
  const { organizationId, user } = await requireOrg();
  const phone = toE164(raw);
  if (!phone) return { ok: false, error: "That doesn't look like a US or Canadian mobile number." };
  try {
    await enforceRateLimit(`sms-verify:${user.id}`, 5, HOUR, "verification texts");
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }
  if (await db.smsOptOut.findUnique({ where: { phone }, select: { phone: true } })) {
    return { ok: false, error: `${pretty(phone)} replied STOP to JobFlex texts. Text START to our number from that phone first.` };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.phoneVerification.deleteMany({ where: { userId: user.id } });
  await db.phoneVerification.create({
    data: { userId: user.id, phone, codeHash: hashCode(code, user.id), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  const r = await sendText({ organizationId, to: phone, body: verifyText(code), kind: "verify" });
  if (r.ok && r.status === "SKIPPED") {
    // Texting is not configured on this server (the local stand): the code
    // is in the server log, and only there, so the flow can still be walked.
    if (process.env.NODE_ENV !== "production") console.info(`[sms] verification code for …${phone.slice(-4)}: ${code}`);
    return { ok: true, note: "Texting is not set up on this server — the code is in the server log." };
  }
  if (!r.ok) return { ok: false, error: r.reason === "opted-out" ? "That number has opted out of JobFlex texts." : "Couldn't send the code. Check the number and try again." };
  return { ok: true, note: `Code sent to ${pretty(phone)}.` };
}

/** Step two: the code came back — the number is verified, and that is the opt-in. */
export async function confirmPhoneVerification(rawCode: string): Promise<SmsActionResult> {
  const { user } = await requireOrg();
  const code = (rawCode ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the six digits from the text." };
  const v = await db.phoneVerification.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!v) return { ok: false, error: "Ask for a new code first." };
  if (v.expiresAt.getTime() < Date.now()) {
    await db.phoneVerification.delete({ where: { id: v.id } }).catch(() => null);
    return { ok: false, error: "That code expired. Ask for a new one." };
  }
  if (v.attempts >= MAX_ATTEMPTS) {
    await db.phoneVerification.delete({ where: { id: v.id } }).catch(() => null);
    return { ok: false, error: "Too many tries. Ask for a new code." };
  }
  if (v.codeHash !== hashCode(code, user.id)) {
    await db.phoneVerification.update({ where: { id: v.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: `That's not the code. ${MAX_ATTEMPTS - v.attempts - 1} tries left.` };
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { smsPhone: v.phone, smsVerifiedAt: new Date() } }),
    db.phoneVerification.deleteMany({ where: { userId: user.id } }),
  ]);
  revalidatePath(SETTINGS_PATH);
  return { ok: true, note: `${pretty(v.phone)} is verified. The events ticked under Text will reach it.` };
}

/** Drop the mobile: no more texts to this member. */
export async function removeSmsPhone(): Promise<SmsActionResult> {
  const { user } = await requireOrg();
  await db.user.update({ where: { id: user.id }, data: { smsPhone: null, smsVerifiedAt: null } });
  await db.phoneVerification.deleteMany({ where: { userId: user.id } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** An extra office number — the dispatcher, the spouse who runs the books. */
export async function addNotificationPhone(input: { name: string; phone: string }): Promise<SmsActionResult> {
  const { organizationId } = await requireManager();
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const phone = toE164(input.phone);
  if (!name) return { ok: false, error: "Give the number a name — who is this?" };
  if (!phone) return { ok: false, error: "That doesn't look like a US or Canadian number." };
  const count = await db.notificationPhone.count({ where: { organizationId } });
  if (count >= MAX_EXTRA_NUMBERS) return { ok: false, error: `Up to ${MAX_EXTRA_NUMBERS} extra numbers.` };
  if (await db.notificationPhone.findFirst({ where: { organizationId, phone }, select: { id: true } })) return { ok: false, error: "That number is already on the list." };
  await db.notificationPhone.create({ data: { organizationId, name, phone } });
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const r = await sendText({ organizationId, to: phone, body: welcomeText(org?.name ?? null), kind: "welcome" });
  revalidatePath(SETTINGS_PATH);
  if (!r.ok && r.reason === "opted-out") return { ok: true, note: `${name} added — but ${pretty(phone)} replied STOP to JobFlex texts earlier and won't get any until it texts START.` };
  return { ok: true, note: r.ok && r.status === "SENT" ? `${name} added and welcomed by text.` : `${name} added.` };
}

export async function setNotificationPhoneActive(id: string, active: boolean): Promise<SmsActionResult> {
  const { organizationId } = await requireManager();
  const row = await db.notificationPhone.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) return { ok: false, error: "Not found." };
  await db.notificationPhone.update({ where: { id }, data: { active } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function removeNotificationPhone(id: string): Promise<SmsActionResult> {
  const { organizationId } = await requireManager();
  const row = await db.notificationPhone.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) return { ok: false, error: "Not found." };
  await db.notificationPhone.delete({ where: { id } });
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** "Send me a test text" — to the member's own verified mobile. */
export async function sendTestText(): Promise<SmsActionResult> {
  const { organizationId, user } = await requireOrg();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { smsPhone: true, smsVerifiedAt: true } });
  if (!me?.smsPhone || !me.smsVerifiedAt) return { ok: false, error: "Verify a mobile first." };
  if (!isTwilioEnabled()) return { ok: false, error: "Texting is not set up on this server." };
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const r = await sendText({ organizationId, to: me.smsPhone, body: testText(org?.name ?? null), kind: "test" });
  if (!r.ok) return { ok: false, error: r.reason === "duplicate" ? "A test just went out — give it a minute." : r.reason === "opted-out" ? "That number replied STOP." : "Couldn't send. Try again in a moment." };
  return { ok: true, note: `Test text sent to ${pretty(me.smsPhone)}.` };
}
