// Resolve the app's public base URL for links we put in emails, SMS, share
// links, and payment redirects. Header-first: links point at the SAME domain the
// triggering request came from (localhost in dev, jobflex-v3.vercel.app or a
// custom domain in prod) instead of a hardcoded env value — the fix for invite
// emails linking to localhost when NEXT_PUBLIC_APP_URL is unset in prod.
// On Vercel, x-forwarded-host/-proto are platform-set (not caller-forgeable), so
// this is safe for sensitive links (password reset, invites).
// Env/localhost fallbacks cover contexts with no request scope.
import { headers } from "next/headers";

export async function appBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // No request scope (e.g. build-time or background work) — fall through to env.
  }
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
