import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { CONSENT_COOKIE, REGION_COOKIE, consentFromCookies } from "@/lib/consent";
import { fbcFromFbclid, sendMetaEvent } from "@/lib/metaCapi";
import { MINUTE, ipFromRequest, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/* The Conversions API copy of the public pages' Meta events (2026-10-01,
   lib/metaEvents): ViewContent from the landing, Lead from register step 1.
   The browser sends its own event with the same event_id, so Meta keeps one.

   Sends ONLY with marketing consent, read here from the request's own
   cookies by the same rule the browser uses (lib/consent) — a body cannot
   claim it. With consent the event carries the pixel's _fbp/_fbc — the
   request's cookies, else the body's copy of them, else an fbc built from
   the ad's fbclid — the IP and the user agent; a Lead adds the hashed email,
   which is also its external_id (lib/metaCapi; the address never leaves raw).

   Always 204, whatever happened, so the endpoint tells a caller nothing. */

const schema = z.object({
  event: z.enum(["ViewContent", "Lead"]),
  eventId: z.string().regex(/^[\w-]{8,80}$/),
  params: z
    .object({ content_name: z.string().regex(/^[\w &-]{1,40}$/).optional().catch(undefined) })
    .optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  fbclid: z.string().regex(/^[\w-]{1,500}$/).optional().catch(undefined),
  /** The pixel's cookies as the browser read them, for a request sent before
   *  they reached the cookie jar. Malformed values are dropped. */
  fbp: z.string().regex(/^fb\.\d\.\d{10,16}\.\d{1,20}$/).optional().catch(undefined),
  fbc: z.string().regex(/^fb\.\d\.\d{10,16}\.[\w-]{1,500}$/).optional().catch(undefined),
  sourceUrl: z.string().url().max(400).optional(),
});

function sameSite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "same-site";
  // No Sec-Fetch-Site (older webviews): the Origin must be this host.
  try {
    return new URL(req.headers.get("origin") ?? "").host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const done = () => new NextResponse(null, { status: 204 });
  if (!sameSite(req)) return done();
  const ip = ipFromRequest(req);
  // A brake on a loop or a script, per instance: a real visitor sends two.
  if (!rateLimit(`meta-event:${ip}`, 20, MINUTE).ok) return done();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return done();
  const body = parsed.data;

  const consent = consentFromCookies(req.cookies.get(CONSENT_COOKIE)?.value, req.cookies.get(REGION_COOKIE)?.value);
  if (!consent.marketing) return done();

  // Only an address on this site names the page the event happened on.
  const host = req.headers.get("host");
  let sourceUrl: string | null = null;
  try {
    if (body.sourceUrl && new URL(body.sourceUrl).host === host) sourceUrl = body.sourceUrl;
  } catch {
    /* dropped */
  }

  const fbp = req.cookies.get("_fbp")?.value || body.fbp;
  const fbc = req.cookies.get("_fbc")?.value || body.fbc || fbcFromFbclid(body.fbclid, Date.now());
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  after(() =>
    sendMetaEvent({
      eventName: body.event,
      eventId: body.eventId,
      sourceUrl,
      consent: true,
      user: {
        email: body.event === "Lead" ? body.email ?? null : null,
        fbp: fbp ?? null,
        fbc: fbc ?? null,
        clientIp: ip === "unknown" ? null : ip,
        userAgent,
      },
      custom: { content_name: body.params?.content_name ?? "default" },
    }),
  );
  return done();
}
