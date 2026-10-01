"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { effectiveConsent, onConsent } from "@/lib/consent";
import { isMetaPixelConfigured, loadMetaPixel, metaPageView, unloadMetaPixel } from "@/lib/metaPixel";

/* Loads the Meta Pixel while marketing is allowed — the visitor's record, else
   the country's default (lib/consent) — and sends the standard
   PageView on the pages that matter for ads — the landing (/, any
   ?industry=), /pricing and the register page. Renders nothing; with no
   NEXT_PUBLIC_META_PIXEL_ID the component does nothing. */
const PAGEVIEW_PATHS = new Set(["/", "/pricing", "/auth/register"]);

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
    apply(effectiveConsent().marketing);
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
    metaPageView();
  }

  // Route → PageView (only when the pixel is loaded, i.e. consent exists).
  useEffect(() => {
    if (!isMetaPixelConfigured() || !pathname || !PAGEVIEW_PATHS.has(pathname)) return;
    if (!effectiveConsent().marketing) return;
    view(pathname, searchParams?.get("industry"));
  }, [pathname, searchParams]);

  return null;
}
