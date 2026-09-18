import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";

// The standalone handheld URLs (/mobile-*, /trade-services) are protected too:
// they render the same org data as their /dashboard twins and the (mobile)
// group layout applies the same role + custom-plan gates, which read the
// x-pathname header set here.
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/influencer", "/v3", "/mobile-", "/trade-services"];

// Handheld surfaces that are public by design (marketing, homeowner intake,
// the customer's proposal view, the auth screens, the estimator picker).
const PUBLIC_MOBILE_PREFIXES = [
  "/mobile-homeowner-v2",
  "/mobile-proposal-client-v2",
  "/mobile-estimator-picker-v2",
  "/mobile-v1",
];

/* THE LANDINGS THAT ARE GONE (owner, 2026-09-18). landing-e is the only one,
   and it is the root; /landing, its A/B/C drafts, the aerial draft and the
   handheld twin were removed with their components. They are redirected rather
   than left to 404 because links to them exist outside this codebase — an ad,
   a bookmark, a signature — and a 404 spends a visitor the ads were paid for.

   308, not 302: the move is permanent and the method must be preserved. The
   query string rides along untouched, which is the point — `?industry=roofing`
   picks the trade hero, and utm_* / fbclid are how the visit is attributed.
   /landing-e keeps its own redirect in the route itself (it has to read the
   query to rebuild it there); everything listed here is gone from the app. */
const REMOVED_LANDINGS = new Set([
  "/landing",
  "/landing-a",
  "/landing-b",
  "/landing-c",
  "/landing-aerial",
  "/mobile-landing-v2",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (REMOVED_LANDINGS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    // url.search is carried over by clone(); nothing else is touched.
    return NextResponse.redirect(url, 308);
  }
  // Influencer login + invite set-password must stay reachable without a session.
  if (
    pathname.startsWith("/influencer/login") ||
    pathname.startsWith("/influencer/set-password")
  ) {
    return NextResponse.next();
  }
  if (PUBLIC_MOBILE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // Cookie-presence only — the real principal/role gate lives in the route
  // group layouts and server guards (requirePlatformAdmin / requireInfluencer).
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  // Platform admin console. Two cookies open it: the authjs session (a user
  // flagged isPlatformAdmin) or the signed `jf_admin` cookie minted by the
  // username/password login (src/actions/adminAuth.ts). Presence only, like the
  // rule below — the (admin) layout verifies the signature and the DB flag.
  // /admin/login is reachable with neither, or the door could never be opened.
  // The pathname header is set here too: the (admin) layout reads it to render
  // the login page bare instead of guarding it (a guard there would redirect
  // the login page to itself).
  if (pathname.startsWith("/admin")) {
    const adminHeaders = new Headers(req.headers);
    adminHeaders.set("x-pathname", pathname);
    const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
    const adminCookie = req.cookies.get("jf_admin")?.value;
    if (!isLogin && !sessionToken && !adminCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request: { headers: adminHeaders } });
  }

  if (!sessionToken) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/influencer") ? "/influencer/login" : "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Limited-role route-gate (UX layer). Decode the JWT to read the role and keep
  // workers / sales reps / estimators inside their allowed surfaces (including
  // bouncing a bare /dashboard hit to their home page). Fail-open by design: if
  // decoding ever fails we do NOT restrict — nav hiding, per-page data scoping,
  // and the server guards (requireManager & friends) are the real boundaries, so
  // a hiccup here can never lock a manager out or expose a write path.
  // /v3 sandbox routes render the same org-wide data as their live twins, so
  // limited roles are kept out of them entirely (their home is under /dashboard).
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/v3")) {
    try {
      const secureCookie =
        req.cookies.has("__Secure-authjs.session-token") ||
        (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
      const cookieName = secureCookie
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
        salt: cookieName,
        secureCookie,
        cookieName,
      });
      const gate = token?.role ? ROLE_ROUTE_GATES[String(token.role)] : undefined;
      if (gate && !isPathAllowed(gate, pathname)) {
        const url = req.nextUrl.clone();
        url.pathname = gate.home;
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch {
      // fail-open — see comment above
    }
  }

  // Expose the path to server components (the dashboard layout reads this to
  // fail CLOSED on the worker route-gate even if the JWT decode above threw —
  // the layout derives role from the DB, not the JWT, so it's the real boundary).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/influencer/:path*",
    "/v3/:path*",
    "/mobile-:slug*",
    "/trade-services/:path*",
    "/trade-services",
    // The removed landings, by exact path: the middleware exists for them only
    // to answer 308, and matching a prefix would put every /landing-* URL this
    // app may grow later through the auth machinery above for no reason.
    "/landing",
    "/landing-a",
    "/landing-b",
    "/landing-c",
    "/landing-aerial",
    // Listed exactly, not left to "/mobile-:slug*": that pattern did not match
    // this path and the URL 404'd instead of redirecting.
    "/mobile-landing-v2",
  ],
};
