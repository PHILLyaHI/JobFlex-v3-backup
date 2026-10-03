"use server";

// Admin · Lead alerts — the controls behind /admin/lead-center/alerts
// (lib/leadCenter/alerts, 2026-10-03). Platform admins only. Every write reads
// the settings row, changes one thing and saves it whole.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { toE164 } from "@/lib/phone";
import { enforceRateLimit, HOUR, RateLimitError } from "@/lib/rateLimit";
import {
  ALERT_TIME_ZONES,
  MAX_ALERT_EMAILS,
  MAX_ALERT_PHONES,
  REMIND_CHOICES,
  checkAlertPhoneCode,
  readLeadAlertSettings,
  sendAlertPhoneCode,
  sendTestLeadAlert,
  writeLeadAlertSettings,
  type LeadAlertSettings,
} from "@/lib/leadCenter/alerts";

const PATH = "/admin/lead-center/alerts";
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export type LeadAlertsResult = { ok: true; note: string } | { ok: false; error: string };

/** "(425) 772-6587" for a saved E.164 number. */
function pretty(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
}

/** Text a code; the words for the page. */
async function textCode(phone: string): Promise<LeadAlertsResult> {
  const sent = await sendAlertPhoneCode(phone);
  if (!sent.ok) return sent;
  return {
    ok: true,
    note: sent.via === "twilio" ? `Code sent to ${pretty(phone)} — type it in below.` : "Texting is not set up on this server — the code is in the server log.",
  };
}

async function update(change: (s: LeadAlertSettings) => LeadAlertSettings): Promise<LeadAlertSettings> {
  const next = change(await readLeadAlertSettings());
  await writeLeadAlertSettings(next);
  revalidatePath(PATH);
  return next;
}

async function brake(key: string, max: number, what: string): Promise<string | null> {
  try {
    await enforceRateLimit(key, max, HOUR, what);
    return null;
  } catch (err) {
    if (err instanceof RateLimitError) return err.message;
    throw err;
  }
}

/** The alert email's addresses — commas, spaces or new lines between them. Empty = the default. */
export async function saveLeadAlertEmails(raw: string): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const list = [...new Set(String(raw ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = list.find((e) => !EMAIL.test(e));
  if (bad) return { ok: false, error: `"${bad}" doesn't look like an email address.` };
  if (list.length > MAX_ALERT_EMAILS) return { ok: false, error: `Up to ${MAX_ALERT_EMAILS} addresses.` };
  await update((s) => ({ ...s, emails: list }));
  return { ok: true, note: list.length ? `Saved — alerts go to ${list.join(", ")}.` : "Saved — alerts go to the default address." };
}

/** The texting switch (lib/leadCenter/alerts header: JobFlex's number). */
export async function setLeadAlertTexts(on: boolean): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const s = await update((cur) => ({ ...cur, textsOn: on === true }));
  if (!s.textsOn) return { ok: true, note: "Texts are off. Email still goes." };
  const ready = s.phones.filter((p) => p.on && p.verifiedAt).length;
  return { ok: true, note: ready ? `Texts are on for ${ready} phone${ready === 1 ? "" : "s"}.` : "Texts are on — add a phone and confirm it with the code." };
}

/** The reminder delay and the clock quiet nights keep. */
export async function setLeadAlertTiming(input: { remindAfterMin: number; timeZone: string }): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const remind = Number(input?.remindAfterMin);
  if (!(REMIND_CHOICES as readonly number[]).includes(remind)) return { ok: false, error: "Pick one of the reminder times." };
  if (!ALERT_TIME_ZONES.some(([z]) => z === input?.timeZone)) return { ok: false, error: "Pick one of the time zones." };
  await update((s) => ({ ...s, remindAfterMin: remind, timeZone: input.timeZone }));
  return { ok: true, note: remind ? "Saved." : "Saved — no reminders." };
}

/** A new phone: saved unconfirmed, and a code texted to it. */
export async function addLeadAlertPhone(input: { name: string; phone: string }): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const phone = toE164(input?.phone);
  if (!phone) return { ok: false, error: "That doesn't look like a US or Canadian mobile number." };
  const name = String(input?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || pretty(phone);
  const current = await readLeadAlertSettings();
  if (current.phones.some((p) => p.phone === phone)) return { ok: false, error: `${pretty(phone)} is already on the list.` };
  if (current.phones.length >= MAX_ALERT_PHONES) return { ok: false, error: `Up to ${MAX_ALERT_PHONES} phones.` };
  if (await db.smsOptOut.findUnique({ where: { phone }, select: { phone: true } })) {
    return { ok: false, error: `${pretty(phone)} replied STOP to JobFlex texts. Text START to JobFlex from that phone first.` };
  }
  const braked = await brake(`lead-alert-code:${phone}`, 5, "codes to this number");
  if (braked) return { ok: false, error: braked };
  const sent = await textCode(phone);
  if (!sent.ok) return sent;
  await update((s) => ({ ...s, phones: [...s.phones, { id: randomUUID(), name, phone, verifiedAt: null, on: true, quietNights: true }] }));
  return sent;
}

/** Another code to a phone still waiting for one. */
export async function resendLeadAlertCode(id: string): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const p = (await readLeadAlertSettings()).phones.find((x) => x.id === id);
  if (!p) return { ok: false, error: "That phone isn't on the list any more." };
  const braked = await brake(`lead-alert-code:${p.phone}`, 5, "codes to this number");
  if (braked) return { ok: false, error: braked };
  return textCode(p.phone);
}

/** The code came back: the phone gets alerts from now on. */
export async function confirmLeadAlertPhone(id: string, rawCode: string): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const code = String(rawCode ?? "").replace(/\D/g, "");
  if (code.length < 4 || code.length > 10) return { ok: false, error: "Enter the digits from the text." };
  const p = (await readLeadAlertSettings()).phones.find((x) => x.id === id);
  if (!p) return { ok: false, error: "That phone isn't on the list any more." };
  const braked = await brake(`lead-alert-check:${p.phone}`, 10, "tries");
  if (braked) return { ok: false, error: braked };
  const check = await checkAlertPhoneCode(p.phone, code);
  if (!check.ok) return check;
  await update((s) => ({ ...s, phones: s.phones.map((x) => (x.id === id ? { ...x, verifiedAt: new Date().toISOString() } : x)) }));
  return { ok: true, note: `${p.name || pretty(p.phone)} is confirmed.` };
}

/** On/off and quiet nights for one phone. */
export async function updateLeadAlertPhone(id: string, patch: { on?: boolean; quietNights?: boolean }): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  let found = false;
  await update((s) => ({
    ...s,
    phones: s.phones.map((x) => {
      if (x.id !== id) return x;
      found = true;
      return {
        ...x,
        ...(typeof patch?.on === "boolean" ? { on: patch.on } : {}),
        ...(typeof patch?.quietNights === "boolean" ? { quietNights: patch.quietNights } : {}),
      };
    }),
  }));
  return found ? { ok: true, note: "Saved." } : { ok: false, error: "That phone isn't on the list any more." };
}

export async function removeLeadAlertPhone(id: string): Promise<LeadAlertsResult> {
  await requirePlatformAdmin();
  const before = await readLeadAlertSettings();
  const p = before.phones.find((x) => x.id === id);
  if (!p) return { ok: true, note: "Removed." };
  await update((s) => ({ ...s, phones: s.phones.filter((x) => x.id !== id) }));
  return { ok: true, note: `${p.name || pretty(p.phone)} removed.` };
}

/** A sample email and a test text, with what happened to each. */
export async function sendLeadAlertTest(): Promise<LeadAlertsResult> {
  const admin = await requirePlatformAdmin();
  const braked = await brake(`lead-alert-test:${admin.id}`, 10, "test alerts");
  if (braked) return { ok: false, error: braked };
  const r = await sendTestLeadAlert();
  const parts = [
    r.emails.length
      ? `Email ${r.emailed === r.emails.length ? "sent" : `sent to ${r.emailed} of ${r.emails.length}`} to ${r.emails.join(", ")}.`
      : "No email address to send to.",
  ];
  if (!r.textsOn) parts.push("Texts are off, so no test text.");
  else if (!r.texts.length) parts.push("No confirmed phone is on, so no test text.");
  else parts.push(...r.texts.map((t) => `${t.name || pretty(t.phone)}: ${t.outcome}.`));
  return { ok: true, note: parts.join(" ") };
}
