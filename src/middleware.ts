import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/influencer", "/v3"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Influencer login + invite set-password must stay reachable without a session.
  if (
    pathname.startsWith("/influencer/login") ||
    pathname.startsWith("/influencer/set-password")
  ) {
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/influencer/:path*", "/v3/:path*"],
};
