"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ATTR_COOKIE,
  ATTR_MAX_AGE_S,
  ATTR_STORAGE_KEY,
  CODE_RE,
  parseAttr,
} from "@/lib/attributionShared";

// Invisible, mounted once in the root layout (under Suspense — useSearchParams).
// Step 1–2 of the attribution loop: a visitor landing anywhere with
// ?promo=MIKE20 or ?ref=ABC-12345 gets the code persisted to a 30-day cookie +
// localStorage, no login required. Last touch wins pre-signup; ?promo beats
// ?ref when both are present (customer discount + commission outrank a credit).
export function AttributionCapture() {
  const searchParams = useSearchParams();

  React.useEffect(() => {
    const promo = searchParams.get("promo");
    const ref = searchParams.get("ref");
    const kind = promo ? "promo" : ref ? "ref" : null;
    const code = (promo ?? ref)?.trim().toUpperCase();
    if (!kind || !code || !CODE_RE.test(code)) return;

    const serialized = JSON.stringify({ k: kind, c: code, t: Date.now() });
    const previous = parseAttr(readStored());
    try {
      document.cookie = `${ATTR_COOKIE}=${encodeURIComponent(serialized)}; path=/; max-age=${ATTR_MAX_AGE_S}; samesite=lax`;
    } catch {
      /* cookies blocked — localStorage below may still work */
    }
    try {
      window.localStorage.setItem(ATTR_STORAGE_KEY, serialized);
    } catch {
      /* private mode — cookie alone still carries the capture */
    }

    // Count the landing once per newly-seen promo code so reloads/back-nav
    // don't inflate the stat. Fire-and-forget; never disturbs the page.
    if (kind === "promo" && previous?.c !== code) {
      void fetch("/api/promo/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [searchParams]);

  return null;
}

function readStored(): string | null {
  const cookieRaw = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${ATTR_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  if (cookieRaw) return cookieRaw;
  try {
    return window.localStorage.getItem(ATTR_STORAGE_KEY);
  } catch {
    return null;
  }
}
