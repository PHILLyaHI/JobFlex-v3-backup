"use client";

/* Meta events from the public pages (2026-10-01), on top of the signup's own
   (register-content: InitiateCheckout, CompleteRegistration).

     ViewContent        landing view, content_name = the trade ("default")   browser + server
     Lead               register step 1 submitted with a free email          browser + server
     EstimatorDemoStep  a hero estimator window reaching a step              browser only
     EstimatorDemoTier  a tier picked in the HVAC hero window                browser only

   CONSENT. Every one of these needs marketing consent — the visitor's record,
   else the country's default (lib/consent) — in the browser, and the server
   checks the same cookies again before it sends its copy (api/meta/event).
   Without consent nothing is sent, either side. The pair shares one event_id,
   so Meta counts it once. */

import { effectiveConsent } from "@/lib/consent";
import { isMetaPixelConfigured, loadMetaPixel, metaTrack, metaTrackCustom, newEventId } from "@/lib/metaPixel";

export type MetaPairEvent = "ViewContent" | "Lead";
export type MetaCustomEvent = "EstimatorDemoStep" | "EstimatorDemoTier";

function allowed(): boolean {
  if (!isMetaPixelConfigured() || !effectiveConsent().marketing) return false;
  // An event fired from a page's first effect runs before the provider's
  // (children first); the load is idempotent, so the event finds its pixel.
  loadMetaPixel();
  return true;
}

/** The browser event and its Conversions API copy, one event_id. False when
 *  nothing was sent (no pixel id, or no marketing consent). */
export function metaTrackWithServer(
  event: MetaPairEvent,
  params: { content_name?: string },
  extra: { email?: string } = {},
): boolean {
  if (!allowed()) return false;
  const eventId = newEventId();
  metaTrack(event, params, eventId);
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid") || undefined;
    void fetch("/api/meta/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive: a CTA tap right after the view must not cancel the copy.
      keepalive: true,
      body: JSON.stringify({
        event,
        eventId,
        params,
        ...(extra.email ? { email: extra.email } : {}),
        ...(fbclid ? { fbclid } : {}),
        sourceUrl: window.location.origin + window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    /* the server copy is best effort */
  }
  return true;
}

export function metaCustomEvent(event: MetaCustomEvent, params: Record<string, string | number>): void {
  if (!allowed()) return;
  metaTrackCustom(event, params);
}
