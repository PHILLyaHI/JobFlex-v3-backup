// Client-safe attribution capture primitives (no Prisma) — the server-side
// validation/binding lives in src/lib/attribution.ts, mirroring the
// planLimits / limitsEngine split.
//
// The cookie/localStorage value is CAPTURED INTENT ONLY. It is written by
// untrusted client code and is re-validated against the database at every
// trust boundary (register bind, Google bind, checkout auto-apply).

export const ATTR_COOKIE = "jf_attr";
export const ATTR_STORAGE_KEY = "jobflex-attribution";
export const ATTR_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Promo codes (MIKE20) and referral codes (ABC-XXXXX) both fit this shape.
export const CODE_RE = /^[A-Za-z0-9_-]{3,40}$/;

export type AttributionKind = "promo" | "ref";

export type CapturedAttribution = {
  k: AttributionKind;
  c: string; // normalized (uppercase) code
  t: number; // capture timestamp (ms)
};

/** Parse a raw cookie/localStorage value; tolerant of URI encoding. Null on any mismatch. */
export function parseAttr(raw: string | null | undefined): CapturedAttribution | null {
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    if (!candidate) continue;
    try {
      const v = JSON.parse(candidate) as Partial<CapturedAttribution>;
      if ((v.k === "promo" || v.k === "ref") && typeof v.c === "string") {
        const code = v.c.trim().toUpperCase();
        if (CODE_RE.test(code)) return { k: v.k, c: code, t: typeof v.t === "number" ? v.t : 0 };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Read the captured attribution from document.cookie / localStorage (client only). */
export function readClientAttr(): CapturedAttribution | null {
  if (typeof document === "undefined") return null;
  const cookieRaw = document.cookie
    .split("; ")
    .find((r) => r.startsWith(`${ATTR_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  const fromCookie = parseAttr(cookieRaw);
  if (fromCookie) return fromCookie;
  try {
    return parseAttr(window.localStorage.getItem(ATTR_STORAGE_KEY));
  } catch {
    return null;
  }
}
