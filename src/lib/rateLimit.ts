// Rate limiting — two layers.
//
// 1. `rateLimit()` — IN-MEMORY AND PER-INSTANCE. Fixed windows in a Map. On a
//    serverless host each instance counts on its own and every deploy clears
//    the map, so on its own this is a brake on a stuck retry loop, not a quota.
//
// 2. `rateLimitShared()` — CROSS-INSTANCE. Fixed windows stored as rows in the
//    app's existing key→string store (SyncState, key `rl:<key>`, cursor
//    `<count>:<resetAt>`), advanced with a compare-and-swap so concurrent
//    lambdas cannot both win the same slot. One or two queries per call; use
//    it on endpoints where the cost of a miss is real (bcrypt, email/SMS sends,
//    paid third-party APIs, public write paths), not on hot polling paths.
//
// `enforceRateLimit()` runs both layers and throws a user-readable error.
// The shared layer FAILS OPEN on a database error (logged) — an outage of the
// limiter must not take the login page down with it.
import { db } from "@/lib/db";

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired windows once the map is big enough to be worth sweeping, so a
 *  key space of user ids cannot grow without bound. */
function prune(now: number): void {
  if (windows.size < 500) return;
  for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
}

export interface RateLimitVerdict {
  /** False = this call is over the limit and should not do its work. */
  ok: boolean;
  /** Milliseconds until the window resets. 0 when `ok`. */
  retryAfterMs: number;
}

/**
 * Count one attempt against `key` in this instance's memory and say whether it
 * is allowed.
 *
 * @param key      caller-namespaced, e.g. `support:<userId>` — two features
 *                 sharing a bare user id would share a budget.
 * @param max      attempts allowed per window.
 * @param windowMs length of the window.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitVerdict {
  const now = Date.now();
  prune(now);
  const existing = windows.get(key);
  const w = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
  windows.set(key, w);
  if (w.count >= max) return { ok: false, retryAfterMs: w.resetAt - now };
  w.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

const SHARED_PREFIX = "rl:";
const CAS_ATTEMPTS = 4;

function parseCursor(cursor: string): Window | null {
  const i = cursor.indexOf(":");
  if (i < 0) return null;
  const count = Number(cursor.slice(0, i));
  const resetAt = Number(cursor.slice(i + 1));
  if (!Number.isFinite(count) || !Number.isFinite(resetAt)) return null;
  return { count, resetAt };
}

/** Opportunistic sweep of stale rows so the key space (ip × email) cannot grow
 *  without bound. ~1 in 50 calls, rows untouched for a day. */
async function sweepShared(now: number): Promise<void> {
  if (Math.random() > 0.02) return;
  await db.syncState
    .deleteMany({
      where: { key: { startsWith: SHARED_PREFIX }, updatedAt: { lt: new Date(now - 86_400_000) } },
    })
    .catch(() => {});
}

/**
 * Cross-instance fixed window. Same contract as `rateLimit()`, but the count
 * lives in the database so every lambda sees the same number.
 */
export async function rateLimitShared(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitVerdict> {
  const rowKey = SHARED_PREFIX + key;
  const now = Date.now();
  try {
    await sweepShared(now);
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const row = await db.syncState.findUnique({ where: { key: rowKey } });
      const current = row ? parseCursor(row.cursor) : null;
      const live = current && current.resetAt > now ? current : null;

      if (live && live.count >= max) {
        return { ok: false, retryAfterMs: live.resetAt - now };
      }
      const next: Window = live
        ? { count: live.count + 1, resetAt: live.resetAt }
        : { count: 1, resetAt: now + windowMs };
      const nextCursor = `${next.count}:${next.resetAt}`;

      if (!row) {
        try {
          await db.syncState.create({ data: { key: rowKey, cursor: nextCursor } });
          return { ok: true, retryAfterMs: 0 };
        } catch {
          continue; // someone else created it first — re-read
        }
      }
      // Compare-and-swap: only advance if nobody moved the row since we read it.
      const { count } = await db.syncState.updateMany({
        where: { key: rowKey, cursor: row.cursor },
        data: { cursor: nextCursor },
      });
      if (count === 1) return { ok: true, retryAfterMs: 0 };
    }
    // Lost the race CAS_ATTEMPTS times in a row: the key is under heavy
    // contention, which is itself a reason to refuse this call.
    return { ok: false, retryAfterMs: 1_000 };
  } catch (err) {
    console.warn(`[rateLimit] shared limiter unavailable for ${key}; allowing:`, err);
    return { ok: true, retryAfterMs: 0 };
  }
}

/** "a minute" / "4 minutes" — for the refusal a user reads. Rounded up, so it
 *  never tells someone to come back before the window has actually reset. */
export function retryInWords(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Both layers; throws `RateLimitError` when over. The in-memory check runs
 * first so a hammering client is refused without a database round trip.
 */
export async function enforceRateLimit(
  key: string,
  max: number,
  windowMs: number,
  what = "requests",
): Promise<void> {
  const local = rateLimit(key, max, windowMs);
  const verdict = local.ok ? await rateLimitShared(key, max, windowMs) : local;
  if (!verdict.ok) {
    throw new RateLimitError(
      `Too many ${what}. Try again in ${retryInWords(verdict.retryAfterMs)}.`,
      verdict.retryAfterMs,
    );
  }
}

/** Client IP from the platform-set forwarding headers (server actions / RSC). */
export async function clientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return ipFromHeaders(h);
  } catch {
    return "local";
  }
}

/** Client IP for Route Handlers, from the request's own headers. */
export function ipFromRequest(req: Request): string {
  return ipFromHeaders(req.headers);
}

function ipFromHeaders(h: Headers): string {
  // Vercel sets x-forwarded-for from the edge; first hop is the client.
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "unknown";
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
