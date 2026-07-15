import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CODE_RE } from "@/lib/attributionShared";

export const runtime = "nodejs";

// httpOnly cookie remembering which promo codes this visitor has already been
// counted for. No PII — just the (public, visitor-supplied) codes. Capped so it
// can never grow unbounded.
const SEEN_COOKIE = "promo_seen";
const SEEN_MAX = 50;
const SEEN_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Lightweight promo-link click counter (no PII, no session). Always answers the
// same 200 regardless of whether the code exists or was counted — this endpoint
// must be useless for enumeration and must never disturb the landing page.
export async function POST(req: NextRequest) {
  const ok = () => NextResponse.json({ ok: true });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!CODE_RE.test(code)) return ok();

  // Server-side dedup: one count per code per visitor. The client guard in
  // attribution-capture.tsx is only the first barrier and is bypassed by any
  // script that doesn't run it; this httpOnly cookie is the real one that a
  // reload — or a cookie-keeping script — can't get past.
  const seen = (req.cookies.get(SEEN_COOKIE)?.value ?? "")
    .split(".")
    .filter((c) => CODE_RE.test(c));
  if (seen.includes(code)) return ok(); // already counted for this visitor

  try {
    await db.promoCode.updateMany({
      where: { code, active: true },
      data: { clicks: { increment: 1 } },
    });
  } catch {
    /* never fail the visitor's page over a stat */
  }

  // Remember this code for this visitor. Setting the cookie regardless of whether
  // the code actually exists keeps the response identical for real vs fake codes,
  // preserving the enumeration-resistance contract above.
  const res = ok();
  res.cookies.set(SEEN_COOKIE, [...seen, code].slice(-SEEN_MAX).join("."), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SEEN_MAX_AGE_S,
  });
  return res;
}
