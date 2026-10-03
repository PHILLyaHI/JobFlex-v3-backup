// TEST LEADS (2026-10-03) — a homeowner request that rehearses the Lead Center
// without touching a real shop.
//
// HOW ONE IS MADE. Either the admin's "Create test lead", or the public wizard
// opened as /homeowner?test=<key>: the page looks and behaves exactly as for
// anyone, the key rides along to the submission, and a valid key marks the
// PlatformLead isTest. A wrong or empty key is an ordinary request — no error,
// no hint, nothing a visitor could learn the key from.
//
// WHAT A TEST LEAD DOES. Never cascades (it parks in the queue as TEST_LEAD);
// can be sent by hand only to isInternal organizations; stays out of the Lead
// Center's statistics and the shops' responsiveness score. Everything after a
// shop has it — price, Stripe, the contacts, Financials — is the real path,
// and the homeowner's own mail and status page are the ordinary ones.
//
// THE KEY lives in SyncState (one row, like the routing mode), never in env,
// so the admin can replace it: the old link stops working that moment.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const KEY = "leadCenter:testKey";

/** queueReason of a test lead waiting in the manual queue. */
export const TEST_QUEUE_REASON = "TEST_LEAD";

export interface TestKey {
  key: string;
  createdAt: string;
}

export async function readTestKey(): Promise<TestKey | null> {
  try {
    const row = await db.syncState.findUnique({ where: { key: KEY } });
    if (!row?.cursor) return null;
    const v = JSON.parse(row.cursor) as TestKey;
    return typeof v?.key === "string" && v.key.length >= 32 ? v : null;
  } catch {
    return null;
  }
}

/** A new key — 256 random bits, URL-safe. The previous one is dead at once. */
export async function rotateTestKey(): Promise<TestKey> {
  const next: TestKey = { key: randomBytes(32).toString("base64url"), createdAt: new Date().toISOString() };
  await db.syncState.upsert({
    where: { key: KEY },
    update: { cursor: JSON.stringify(next) },
    create: { key: KEY, cursor: JSON.stringify(next) },
  });
  return next;
}

/** Whether a submitted key is the current one. Constant time; never throws. */
export async function isValidTestKey(candidate: string | null | undefined): Promise<boolean> {
  const given = (candidate ?? "").trim();
  if (given.length < 32 || given.length > 128) return false;
  const current = await readTestKey();
  if (!current) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(current.key);
  return a.length === b.length && timingSafeEqual(a, b);
}
