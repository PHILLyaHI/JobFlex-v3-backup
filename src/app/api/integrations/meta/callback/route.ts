import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { decryptSecret } from "@/lib/crypto/secretBox";
import { exchangeMetaCode, metaAllowed, safeEqual } from "@/lib/meta/graph";
import { saveMetaCandidates } from "@/lib/meta/connections";

export async function GET(req: NextRequest) {
  const base = process.env.META_REDIRECT_URI ? new URL(process.env.META_REDIRECT_URI).origin : req.nextUrl.origin;
  const back = (status: string) => {
    const response = NextResponse.redirect(new URL(`/dashboard/settings?tab=integrations&sub=meta&meta=${status}`, base));
    response.cookies.set("jf_meta_oauth", "", { path: "/api/integrations/meta", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  try {
    const cookie = req.cookies.get("jf_meta_oauth")?.value;
    const state = req.nextUrl.searchParams.get("state");
    if (!cookie || !state) return back("invalid_state");
    const saved = z.object({ state: z.string(), organizationId: z.string(), actorId: z.string(), expiresAt: z.number() }).parse(JSON.parse(decryptSecret(cookie)));
    const { organizationId, user } = await requireManager();
    if (!safeEqual(state, saved.state) || saved.expiresAt < Date.now() || saved.organizationId !== organizationId || saved.actorId !== user.id || !metaAllowed(user.email)) return back("invalid_state");
    if (req.nextUrl.searchParams.has("error")) return back("denied");
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return back("denied");
    const grant = await exchangeMetaCode(code);
    if (!grant.pages.length) return back("no_pages");
    await saveMetaCandidates(organizationId, user.id, grant);
    return back("choose_page");
  } catch {
    // Do not log codes, tokens, raw Meta responses or exception payloads.
    return back("failed");
  }
}
