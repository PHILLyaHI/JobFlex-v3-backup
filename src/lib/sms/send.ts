// EVERY TEXT GOES THROUGH HERE (2026-09-24) — server only.
//
// JobFlex owns the Twilio account (src/lib/sdk/twilio); a contractor only
// adds numbers. This is the one chokepoint, and it decides what SmartSpace's
// texting learned the hard way:
//   - a number that replied STOP is never texted again (SmsOptOut);
//   - the same words to the same number twice in ten minutes is once;
//   - caps per number, per company and platform-wide, per day, fail-closed —
//     every text costs money, so a limiter outage pauses texting;
//   - quiet hours hold a text until the morning, folded with the others;
//   - Twilio off (the local stand, a fresh deploy) is a SKIPPED row, not an
//     error — the app works the same, and the log shows what would have gone.
// Every text is a row in SmsMessage: the usage counter, the delivery status
// from Twilio's callback, the thing a support question is answered from.

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { toE164 } from "@/lib/phone";
import { DAY, rateLimitShared } from "@/lib/rateLimit";
import { isTwilioEnabled, sendSMS } from "@/lib/sdk/twilio";
import {
  defaultNotificationPrefs,
  inQuietHours,
  nextQuietEnd,
  parseNotificationPrefs,
  SMS_URGENT_KEYS,
  smsDecision,
  type PrefKey,
} from "@/lib/notificationPrefsShared";
import { brand, clip, heldDigestText, SMS_MAX, unbrand } from "./format";

const CAP_PER_NUMBER_PER_DAY = 25;
const CAP_PER_ORG_PER_DAY = 500;
const CAP_PLATFORM_PER_DAY = 5000;
const DUPLICATE_WINDOW_MS = 10 * 60_000;
const OFFICE_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

export type SendTextInput = {
  organizationId: string | null;
  to: string;
  body: string;
  /** A preference key, or "crew-assigned", "verify", "welcome", "test", "reply", … */
  kind: string;
  /** Hold until then (quiet hours); the hourly cron sends it. */
  sendAfter?: Date | null;
};
export type SendTextResult =
  | { ok: true; id: string; status: "SENT" | "SKIPPED" | "HELD" }
  | { ok: false; reason: "invalid-number" | "opted-out" | "duplicate" | "cap" | "limiter-down" | "failed" };

/** Send one text (or hold it). Never throws. */
export async function sendText(input: SendTextInput): Promise<SendTextResult> {
  const to = toE164(input.to);
  if (!to) return { ok: false, reason: "invalid-number" };
  const body = clip(input.body, SMS_MAX);
  try {
    if (await db.smsOptOut.findUnique({ where: { phone: to }, select: { phone: true } })) return { ok: false, reason: "opted-out" };
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const dup = await db.smsMessage.findFirst({ where: { to, body, direction: "OUT", createdAt: { gte: since } }, select: { id: true } });
    if (dup) return { ok: false, reason: "duplicate" };
  } catch (err) {
    console.error(`[sms] pre-send check failed: ${msg(err)}`);
    return { ok: false, reason: "failed" };
  }
  if (input.sendAfter && input.sendAfter.getTime() > Date.now()) {
    const row = await db.smsMessage.create({
      data: { organizationId: input.organizationId, direction: "OUT", to, body, kind: input.kind, status: "HELD", sendAfter: input.sendAfter },
    });
    return { ok: true, id: row.id, status: "HELD" };
  }
  return dispatch({ organizationId: input.organizationId, to, body, kind: input.kind });
}

async function dispatch(m: { organizationId: string | null; to: string; body: string; kind: string }): Promise<SendTextResult> {
  // Caps, fail-closed: a limiter that cannot answer pauses texting.
  try {
    const perNumber = await rateLimitShared(`sms:to:${m.to}`, CAP_PER_NUMBER_PER_DAY, DAY);
    if (!perNumber.ok) return capped(m, "number");
    if (m.organizationId) {
      const perOrg = await rateLimitShared(`sms:org:${m.organizationId}`, CAP_PER_ORG_PER_DAY, DAY);
      if (!perOrg.ok) return capped(m, "company");
    }
    const all = await rateLimitShared("sms:all", CAP_PLATFORM_PER_DAY, DAY);
    if (!all.ok) return capped(m, "platform");
  } catch (err) {
    console.error(`[sms] limiter down, text not sent: ${msg(err)}`);
    return { ok: false, reason: "limiter-down" };
  }
  const row = await db.smsMessage.create({ data: { organizationId: m.organizationId, direction: "OUT", to: m.to, body: m.body, kind: m.kind, status: "QUEUED" } });
  if (!await isTwilioEnabled()) {
    await db.smsMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: "not-configured" } });
    return { ok: true, id: row.id, status: "SKIPPED" };
  }
  try {
    const statusCallback = `${await appBaseUrl()}/api/twilio/sms/status`;
    // The company's own number when it claimed one (lib/sms/numbers).
    const own = m.organizationId ? (await db.organization.findUnique({ where: { id: m.organizationId }, select: { smsFromNumber: true } }))?.smsFromNumber : null;
    const r = await sendSMS(m.to, m.body, { statusCallback, from: own ?? null });
    await db.smsMessage.update({ where: { id: row.id }, data: { status: "SENT", sid: r.skipped ? null : r.sid } });
    return { ok: true, id: row.id, status: "SENT" };
  } catch (err) {
    await db.smsMessage.update({ where: { id: row.id }, data: { status: "FAILED", error: msg(err).slice(0, 200) } }).catch(() => null);
    console.error(`[sms] send failed (${m.kind} → …${m.to.slice(-4)}): ${msg(err)}`);
    return { ok: false, reason: "failed" };
  }
}

async function capped(m: { organizationId: string | null; to: string; body: string; kind: string }, which: string): Promise<SendTextResult> {
  await db.smsMessage
    .create({ data: { organizationId: m.organizationId, direction: "OUT", to: m.to, body: m.body, kind: m.kind, status: "SKIPPED", error: `cap-${which}` } })
    .catch(() => null);
  console.warn(`[sms] ${which} cap reached, text skipped (${m.kind})`);
  return { ok: false, reason: "cap" };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── the office ────────────────────────────────────────────────────────────

export type OfficeTextOptions = {
  /** Default: owner + admin + manager. */
  roles?: readonly string[];
  /** Members who must not get it (the actor, the worker who answered). */
  excludeUserIds?: readonly string[];
  now?: Date;
};

/**
 * One line to every office member who wants this event by text — through
 * their own Text cell and quiet hours — plus the company's extra numbers
 * (every office event, the company's default quiet hours). The company's
 * name leads the text; numbers are deduped.
 */
export async function textOffice(organizationId: string, key: PrefKey, line: string, opts: OfficeTextOptions = {}): Promise<{ sent: number; held: number }> {
  const now = opts.now ?? new Date();
  const roles = opts.roles ?? OFFICE_ROLES;
  const exclude = new Set(opts.excludeUserIds ?? []);
  let sent = 0;
  let held = 0;
  try {
    const [org, members, extras] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true, timezone: true } }),
      db.membership.findMany({
        where: { organizationId, role: { in: [...roles] } },
        select: { user: { select: { id: true, smsPhone: true, smsVerifiedAt: true, notificationPrefsJson: true } } },
      }),
      db.notificationPhone.findMany({ where: { organizationId, active: true }, select: { phone: true } }),
    ]);
    if (!org) return { sent, held };
    const tz = org.timezone || "America/New_York";
    const body = brand(org.name, line);
    const seen = new Set<string>();
    const go = async (to: string, sendAfter: Date | null) => {
      const r = await sendText({ organizationId, to, body, kind: key, sendAfter });
      if (r.ok && r.status === "HELD") held++;
      else if (r.ok) sent++;
    };
    for (const m of members) {
      const u = m.user;
      if (!u?.smsPhone || !u.smsVerifiedAt || exclude.has(u.id)) continue;
      const to = toE164(u.smsPhone);
      if (!to || seen.has(to)) continue;
      const prefs = parseNotificationPrefs(u.notificationPrefsJson);
      const decision = smsDecision(prefs, key, now, tz);
      if (decision === "skip") continue;
      seen.add(to);
      await go(to, decision === "hold" ? nextQuietEnd(prefs, now, tz) : null);
    }
    const defaults = defaultNotificationPrefs();
    for (const x of extras) {
      const to = toE164(x.phone);
      if (!to || seen.has(to)) continue;
      seen.add(to);
      const hold = !SMS_URGENT_KEYS.includes(key) && inQuietHours(defaults, now, tz);
      await go(to, hold ? nextQuietEnd(defaults, now, tz) : null);
    }
  } catch (err) {
    console.error(`[sms] office text "${key}" failed: ${msg(err)}`);
  }
  return { sent, held };
}

/**
 * A text to every office number right now, no preference gate — a reply
 * from the field is forwarded whatever the hour.
 */
export async function textOfficeNow(organizationId: string, line: string, opts: { excludePhones?: readonly string[]; kind?: string } = {}): Promise<number> {
  let sent = 0;
  try {
    const [org, members, extras] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      db.membership.findMany({ where: { organizationId, role: { in: [...OFFICE_ROLES] } }, select: { user: { select: { smsPhone: true, smsVerifiedAt: true } } } }),
      db.notificationPhone.findMany({ where: { organizationId, active: true }, select: { phone: true } }),
    ]);
    const skip = new Set((opts.excludePhones ?? []).map((p) => toE164(p)).filter(Boolean));
    const seen = new Set<string>();
    const body = brand(org?.name, line);
    const numbers = [...members.map((m) => (m.user?.smsVerifiedAt ? m.user.smsPhone : null)), ...extras.map((x) => x.phone)];
    for (const raw of numbers) {
      const to = toE164(raw);
      if (!to || seen.has(to) || skip.has(to)) continue;
      seen.add(to);
      const r = await sendText({ organizationId, to, body, kind: opts.kind ?? "reply" });
      if (r.ok) sent++;
    }
  } catch (err) {
    console.error(`[sms] office forward failed: ${msg(err)}`);
  }
  return sent;
}

// ── a worker ──────────────────────────────────────────────────────────────

export type WorkerLike = { phone: string | null; smsOptIn: boolean; organizationId: string };

/** A text to one worker who has a phone and the schedule switch on. */
export async function textWorker(w: WorkerLike, body: string, kind: string): Promise<SendTextResult | null> {
  if (!w.phone || !w.smsOptIn) return null;
  return sendText({ organizationId: w.organizationId, to: w.phone, body, kind });
}

// ── the morning after ─────────────────────────────────────────────────────

/**
 * Texts held through the quiet hours go out now, one message per number:
 * a single held text as it was, several folded into one "overnight" line.
 * The held rows are marked MERGED; the text that went out is its own row.
 */
export async function flushHeldTexts(now = new Date()): Promise<number> {
  const due = await db.smsMessage.findMany({
    where: { status: "HELD", sendAfter: { lte: now } },
    orderBy: { createdAt: "asc" },
    select: { id: true, organizationId: true, to: true, body: true, kind: true },
  });
  if (!due.length) return 0;
  const orgIds = [...new Set(due.map((r) => r.organizationId).filter((x): x is string => Boolean(x)))];
  const orgs = new Map((await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  const groups = new Map<string, typeof due>();
  for (const r of due) {
    const k = `${r.organizationId ?? "-"}|${r.to}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  let out = 0;
  for (const rows of groups.values()) {
    const orgName = rows[0].organizationId ? (orgs.get(rows[0].organizationId) ?? null) : null;
    const body = rows.length === 1 ? rows[0].body : heldDigestText(orgName, rows.map((r) => unbrand(orgName, r.body)));
    await db.smsMessage.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "MERGED" } });
    const r = await dispatch({ organizationId: rows[0].organizationId, to: rows[0].to, body, kind: rows.length === 1 ? (rows[0].kind ?? "held") : "overnight" });
    if (r.ok) out++;
  }
  return out;
}
