import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/influencer"];

// Field workers (INSTALLER) get a read-only, self-scoped slice of the dashboard:
// their jobs and their schedule. Everything else under /dashboard is manager-only.
const WORKER_ALLOWED_PREFIXES = ["/dashboard/jobs", "/dashboard/calendar", "/dashboard/messages"];
const WORKER_HOME = "/dashboard/jobs";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The influencer login page must stay reachable without a session.
  if (pathname.startsWith("/influencer/login")) return NextResponse.next();

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // Cookie-presence only — the real principal/role gate lives in the route
  // group layouts and server guards (requirePlatformAdmin / requireInfluencer).
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith("/influencer") ? "/influencer/login" : "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Worker route-gate (UX layer). Decode the JWT to read the role and keep field
  // workers inside their two allowed surfaces. Fail-open by design: if decoding
  // ever fails we do NOT restrict — nav hiding, per-page data scoping, and the
  // requireManager() server guard are the real boundaries, so a hiccup here can
  // never lock a manager out or expose a write path.
  if (pathname.startsWith("/dashboard")) {
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
      if (token?.role === "INSTALLER") {
        const allowed = WORKER_ALLOWED_PREFIXES.some(
          (p) => pathname === p || pathname.startsWith(p + "/"),
        );
        if (!allowed) {
          const url = req.nextUrl.clone();
          url.pathname = WORKER_HOME;
          url.search = "";
          return NextResponse.redirect(url);
        }
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
  matcher: ["/dashboard/:path*", "/admin/:path*", "/influencer/:path*"],
};
