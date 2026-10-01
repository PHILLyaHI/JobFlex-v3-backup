// ONE CARD-LESS TRIAL PER PERSON AND PER COMPANY (owner, 2026-10-01).
//
// A trial that asks for no card is easy to take twice. Three brakes, on top
// of the email confirmation the trial cannot start without:
//   · per IP — at most CARDLESS_TRIAL_PER_IP_HOUR trial requests an hour
//     (default 3), the shared limiter (lib/rateLimit);
//   · per address — one trial per mailbox, with Gmail's dots and any "+tag"
//     folded away, so jo.e+1@gmail.com is joe@gmail.com;
//   · per company domain — when the address is a company's own (not a public
//     mailbox like gmail.com), one trial per domain: a second person at
//     ridgeline-roofing.com gets told the shop already had one.
// The marks are SyncState rows (`trial-email:<sha256>`, `trial-domain:<d>`)
// written when a trial starts and never removed — deleting the account does
// not reset them.
import "server-only";
import { createHash } from "crypto";
import { db } from "@/lib/db";

const PUBLIC_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "pm.me", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "yandex.ru", "mail.ru",
  "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "cox.net", "charter.net", "earthlink.net",
  "bellsouth.net", "optonline.net", "frontier.com", "windstream.net", "hey.com", "fastmail.com", "tutanota.com",
]);

/** Requests per IP per hour (CARDLESS_TRIAL_PER_IP_HOUR, default 3). */
export function trialRequestsPerIpHour(): number {
  const n = Number(process.env.CARDLESS_TRIAL_PER_IP_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

/** The mailbox as a person, not as a string: lower-cased, "+tag" dropped,
 *  and Gmail's dots ignored. */
export function canonicalTrialEmail(email: string): string {
  const [rawLocal, rawDomain = ""] = email.trim().toLowerCase().split("@");
  let local = rawLocal.split("+")[0];
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** The company's domain, or null for a public mailbox. */
export function trialCompanyDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain || PUBLIC_MAIL.has(domain)) return null;
  return domain;
}

const emailKey = (email: string) => `trial-email:${createHash("sha256").update(canonicalTrialEmail(email)).digest("hex")}`;
const domainKey = (domain: string) => `trial-domain:${domain}`;

/** Why this address may not start a card-less trial, or null when it may. */
export async function cardlessTrialRefusal(email: string): Promise<string | null> {
  const byEmail = await db.syncState.findUnique({ where: { key: emailKey(email) } }).catch(() => null);
  if (byEmail) return "This email has already had a free trial. Sign in, or start with a card on the plan page.";
  const domain = trialCompanyDomain(email);
  if (domain) {
    const byDomain = await db.syncState.findUnique({ where: { key: domainKey(domain) } }).catch(() => null);
    if (byDomain) return `${domain} has already had a free trial. Ask your team's owner to add you, or contact us.`;
  }
  return null;
}

/** Recorded the moment a card-less trial starts. */
export async function markCardlessTrialUsed(email: string, orgId: string): Promise<void> {
  const at = JSON.stringify({ orgId, at: new Date().toISOString() });
  const keys = [emailKey(email)];
  const domain = trialCompanyDomain(email);
  if (domain) keys.push(domainKey(domain));
  for (const key of keys) {
    await db.syncState.upsert({ where: { key }, update: {}, create: { key, cursor: at } }).catch((err) => {
      console.warn("[trial-guard] mark not written:", err);
    });
  }
}
