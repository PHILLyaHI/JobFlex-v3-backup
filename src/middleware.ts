import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";
import { isPartnerPublic, principalRedirect } from "@/lib/principalRoutes";
import { REGION_COOKIE, REGION_MAX_AGE_S, consentModeFor } from "@/lib/consent";

// The standalone handheld URLs (/mobile-*, /trade-services) are protected too:
// they render the same org data as their /dashboard twins and the (mobile)
// group layout applies the same role + custom-plan gates, which read the
// x-pathname header set here.
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/influencer", "/v3", "/mobile-", "/trade-services"];

// Handheld surfaces that are public by design (marketing, homeowner intake,
// the customer's proposal view, the auth screens, the estimator picker).
const PUBLIC_MOBILE_PREFIXES = [
  // Removed 2026-10-02 (the homeowner page is /homeowner alone). Left here so
  // the old address answers 404 to everyone — under "/mobile-" a visitor
  // without a session would otherwise be sent to sign in for a page that is gone.
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

/* THE TRADE SHORTCUTS (2026-10-01). /hvac is the HVAC landing's short
   address for an ad, a card or a spoken link: 308 to the root with the trade
   in the query, everything else in the query (utm_*, fbclid) kept. The
   landing reads the variant from the query only, so this is the one way in. */
const TRADE_SHORTCUTS: Record<string, string> = {
  "/hvac": "hvac",
};

/* THE INVENTORY PAGES THAT MOVED (owner, 2026-09-29). One page,
   /dashboard/inventory, with the trade in the query; the three per-trade
   boards, the HVAC service menu page and the handheld HVAC preview are gone.
   308 by exact path, the query string kept (nothing there was ever read). */
const MOVED_INVENTORY: Record<string, string> = {
  "/dashboard/roof-estimator/board": "/dashboard/inventory?trade=roof&tab=stock",
  "/dashboard/fence-estimator/board": "/dashboard/inventory?trade=fence&tab=stock",
  "/dashboard/hvac-estimator/board": "/dashboard/inventory?trade=hvac&tab=stock",
  "/dashboard/hvac-estimator/services": "/dashboard/inventory?trade=hvac&tab=services",
  "/mobile-hvac-inventory-v1": "/dashboard/inventory?trade=hvac&tab=stock",
};

/* THE CONSENT MODEL BY COUNTRY (owner, 2026-09-30; lib/consent). Vercel's
   x-vercel-ip-country decides notice or opt-in once, on the first page this
   browser asks for, and the answer — never the country — is kept a year in
   jf_region for the client to read. Here rather than in the root layout: a
   request header read there rendered every page per request, /pricing's
   catalogue read included. No header (localhost) is the US: notice. */
export async function middleware(req: NextRequest) {
  const res = await route(req);
  if (!req.cookies.has(REGION_COOKIE)) {
    res.cookies.set(REGION_COOKIE, consentModeFor(req.headers.get("x-vercel-ip-country")), {
      path: "/",
      maxAge: REGION_MAX_AGE_S,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
    });
  }
  return res;
}

async function route(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const moved = MOVED_INVENTORY[pathname];
  if (moved) {
    const url = req.nextUrl.clone();
    const [path, query] = moved.split("?");
    url.pathname = path;
    // The old address's own query rides along (?group=…); the trade and the tab are the new page's.
    for (const [k, v] of new URLSearchParams(query)) url.searchParams.set(k, v);
    return NextResponse.redirect(url, 308);
  }
  const shortcut = TRADE_SHORTCUTS[pathname];
  if (shortcut) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("industry", shortcut);
    return NextResponse.redirect(url, 308);
  }
  if (REMOVED_LANDINGS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    // url.search is carried over by clone(); nothing else is touched.
    return NextResponse.redirect(url, 308);
  }
  // Influencer login, invite / reset set-password and forgot-password must
  // stay reachable without a session (lib/principalRoutes).
  if (isPartnerPublic(pathname)) {
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

  // THE PRINCIPAL FIRST. A partner's session (INFLUENCER) has no organisation:
  // on /dashboard it drew the contractor shell over nothing and every action
  // threw NoOrgError; an owner's session on /influencer found the partner door.
  // Each is sent to its own home. Fail-open like the role gate below — the
  // server guards (requireUser refuses a partner, requireInfluencer refuses a
  // user) are the boundary; this is the redirect that keeps it from being felt.
  if (sessionToken) {
    try {
      const principal = (await decodeSession(req))?.principal;
      const home = principalRedirect(pathname, typeof principal === "string" ? principal : null);
      if (home) {
        const url = req.nextUrl.clone();
        url.pathname = home;
        url.search = "";
        return NextResponse.redirect(url);
      }
    } catch {
      // fail-open — see above
    }
  }

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
      const token = await decodeSession(req);
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

/** The session JWT's claims, or null. Same cookie rules NextAuth uses. */
async function decodeSession(req: NextRequest) {
  const secureCookie =
    req.cookies.has("__Secure-authjs.session-token") ||
    (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
  const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
  return getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    salt: cookieName,
    secureCookie,
    cookieName,
  });
}

export const config = {
  // Every page, for the jf_region cookie above; the auth, role and redirect
  // rules inside still apply only to the paths they name. API routes, Next's
  // own files and anything with a file extension (images, fonts, robots.txt)
  // never come through here.
  matcher: ["/((?!api/|_next/|_vercel/|.*\\.[\\w]+$).*)"],
};
