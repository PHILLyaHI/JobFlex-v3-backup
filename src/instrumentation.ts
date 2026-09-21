// Next's server error hook — the net under lib/server-events' wrapper. Every
// error the framework catches (a server action that threw, a route handler, a
// server component render) lands here once; an error the wrapper has already
// logged is recognised and skipped. Sends `server_error` with the route FILE
// path ("/dashboard/proposals/[id]", never the URL), the kind, a code and the
// organization — no message, no query string, no body.

import type { Instrumentation } from "next";
import { getToken } from "next-auth/jwt";
import { reportServerError, type ServerErrorKind } from "@/lib/server-events";

/** The active organization off the session cookie. Best effort: null on any doubt. */
async function organizationOf(headers: Record<string, string | string[] | undefined>): Promise<string | null> {
  try {
    const raw = headers.cookie;
    const cookie = Array.isArray(raw) ? raw.join("; ") : raw ?? "";
    if (!cookie.includes("authjs.session-token")) return null;
    // Same cookie-name rule as the middleware.
    const secureCookie = cookie.includes("__Secure-authjs.session-token");
    const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
    const token = await getToken({
      req: { headers: new Headers({ cookie }) },
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
      salt: cookieName, secureCookie, cookieName,
    });
    return typeof token?.activeOrgId === "string" ? token.activeOrgId : null;
  } catch { return null; }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  const kind: ServerErrorKind = context.routeType === "render" ? "render"
    : context.routeType === "action" ? "action"
    : context.routeType === "route" ? (context.routePath.startsWith("/api/webhooks") ? "webhook" : "route") : "proxy";
  await reportServerError(context.routePath || "unknown", error, { kind, organizationId: await organizationOf(request.headers) });
};
