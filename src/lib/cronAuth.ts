import { timingSafeEqual } from "node:crypto";

// Shared cron authorization. Accepts CRON_SECRET via the `x-cron-key` header or
// Vercel's `Authorization: Bearer` header (attached to scheduled invocations).
// The secret is NOT accepted via the query string — that would leak it into
// access logs, proxies, and referrers.
//
// Fail-closed in production: several cron routes move money (payout transfers,
// commission clearing), so a missing/misconfigured CRON_SECRET must DENY, not
// silently open the endpoint. Outside production the secret is optional so local
// dev can hit the routes without one.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const header = req.headers.get("x-cron-key");
  const bearer = req.headers.get("authorization");
  return (
    safeEqual(header, secret) || safeEqual(bearer, `Bearer ${secret}`)
  );
}

// Constant-time string compare that never throws on length mismatch.
function safeEqual(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
