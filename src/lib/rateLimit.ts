// A brake for server actions that write a row and send mail on every call.
//
// IN-MEMORY AND PER-INSTANCE. Fixed windows in a Map, the same shape the admin
// login's failure counter already uses (src/actions/adminAuth.ts). On a
// multi-instance host each instance counts on its own, and every deploy clears
// the map, so treat this as a brake on a stuck retry loop or a bored user
// holding the send button — not as a quota. Anything that needs to hold across
// instances needs a row or a shared store, and that is a data-layer decision.

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
 * Count one attempt against `key` and say whether it is allowed.
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

/** "a minute" / "4 minutes" — for the refusal a user reads. Rounded up, so it
 *  never tells someone to come back before the window has actually reset. */
export function retryInWords(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
