// Shared cron authorization. Accepts the project's CRON_SECRET via the
// `x-cron-key` header, a `?key=` param, or Vercel's `Authorization: Bearer`
// header (which Vercel attaches to scheduled invocations automatically).
// When no CRON_SECRET is set (local dev), requests are allowed.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const provided = req.headers.get("x-cron-key") ?? url.searchParams.get("key");
  if (provided === secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}
