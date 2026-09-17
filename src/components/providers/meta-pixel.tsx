"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { onConsent, readConsent } from "@/lib/consent";
import { isMetaPixelConfigured, loadMetaPixel, metaTrack, newEventId, unloadMetaPixel } from "@/lib/metaPixel";

/* Loads the Meta Pixel after marketing consent and sends PageView on the
   pages that matter for ads — the landing (/, any
   ?industry=) and the register page — each with a fresh eventID. Renders
   nothing; with no NEXT_PUBLIC_META_PIXEL_ID the component does nothing. */
const PAGEVIEW_PATHS = new Set(["/", "/auth/register"]);

export function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastViewed = useRef("");

  // Consent → load / unload.
  useEffect(() => {
    if (!isMetaPixelConfigured()) return;
    const apply = (marketing: boolean) => {
      if (marketing) loadMetaPixel();
      else {
        unloadMetaPixel();
        lastViewed.current = "";
      }
    };
    apply(readConsent()?.marketing === true);
    return onConsent((c) => {
      apply(c.marketing);
      // Consent given on this very page: count the view it was given on.
      if (c.marketing && pathname && PAGEVIEW_PATHS.has(pathname)) view(pathname, searchParams?.get("industry"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function view(path: string, industry: string | null | undefined) {
    const key = path + "|" + (industry ?? "");
    if (lastViewed.current === key) return;
    lastViewed.current = key;
    metaTrack("PageView", industry ? { industry } : {}, newEventId());
  }

  // Route → PageView (only when the pixel is loaded, i.e. consent exists).
  useEffect(() => {
    if (!isMetaPixelConfigured() || !pathname || !PAGEVIEW_PATHS.has(pathname)) return;
    if (readConsent()?.marketing !== true) return;
    view(pathname, searchParams?.get("industry"));
  }, [pathname, searchParams]);

  return null;
}
