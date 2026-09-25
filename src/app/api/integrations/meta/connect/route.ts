import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/orgContext";
import { encryptSecret } from "@/lib/crypto/secretBox";
import { metaAllowed, metaId, metaLoginUrl } from "@/lib/meta/graph";
import { rateLimitShared, MINUTE } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  try {
    const { organizationId, user } = await requireManager();
    if (!metaAllowed(user.email)) return NextResponse.json({ error: "Meta is not configured or enabled for this account." }, { status: 403 });
    const requestedPage = req.nextUrl.searchParams.get("pageId");
    const pageId = requestedPage === null ? undefined : metaId.safeParse(requestedPage.trim());
    if (pageId && !pageId.success) return NextResponse.json({ error: "Enter a numeric Facebook Page ID (up to 40 digits)." }, { status: 400 });
    if (!(await rateLimitShared(`meta:oauth:${user.id}`, 10, 10 * MINUTE)).ok) return NextResponse.json({ error: "Please wait before connecting again." }, { status: 429 });
    const redirect = new URL(process.env.META_REDIRECT_URI!);
    if (req.nextUrl.origin !== redirect.origin) {
      const canonical = new URL("/api/integrations/meta/connect", redirect.origin);
      if (pageId?.success) canonical.searchParams.set("pageId", pageId.data);
      return NextResponse.redirect(canonical);
    }
    const state = crypto.randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(metaLoginUrl(state));
    response.cookies.set("jf_meta_oauth", encryptSecret(JSON.stringify({ state, organizationId, actorId: user.id, expiresAt: Date.now() + 10 * MINUTE, ...(pageId?.success ? { pageId: pageId.data } : {}) })), { httpOnly: true, secure: redirect.protocol === "https:", sameSite: "lax", path: "/api/integrations/meta", maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Sign in as a workspace owner or manager to connect Meta." }, { status: 401 });
  }
}
