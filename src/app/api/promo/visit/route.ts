import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CODE_RE } from "@/lib/attributionShared";

export const runtime = "nodejs";

// Lightweight promo-link click counter (no PII, no session). Always answers the
// same 200 regardless of whether the code exists — this endpoint must be
// useless for enumeration and must never disturb the landing page.
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (CODE_RE.test(code)) {
      await db.promoCode.updateMany({
        where: { code, active: true },
        data: { clicks: { increment: 1 } },
      });
    }
  } catch {
    /* never fail the visitor's page over a stat */
  }
  return NextResponse.json({ ok: true });
}
