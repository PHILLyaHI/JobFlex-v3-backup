// Next's `redirect()` reports itself by THROWING, and that throw crosses the
// server-action boundary. So a client component that wraps a redirecting action
// in `try { await action() } catch (e)` sees the SUCCESS path arrive as a
// failure — and a handler that renders `e.message` prints the literal string
// "NEXT_REDIRECT" in its error box for the frame or two before the router
// completes the navigation the action actually asked for.
//
// That is the red banner that used to flash on the worker invite's "Create
// account" step: `acceptWorkerInvite` finishes with NextAuth's
// `signIn(..., { redirectTo: "/dashboard/jobs" })`, which redirects, which
// throws.
//
// WHY THE DIGEST AND THE MESSAGE. Server-side, Next stamps redirect errors with
// `digest = "NEXT_REDIRECT;replace;/dashboard/jobs;307;"`. What survives the
// action boundary is version- and mode-dependent — in this app's dev build the
// client receives the message and not always the digest — so both are checked.
// Reading them directly, rather than importing `isRedirectError` from
// `next/dist/client/components/redirect`, keeps this off a private path that
// has already moved twice between Next majors.
//
// NOT for use inside a server action: there, a redirect error must be RETHROWN
// so the framework can act on it. This is the client-side half — by the time a
// browser handler sees it, the router has already accepted the redirect, so the
// only correct response is to stop treating it as an error.

const MARKER = "NEXT_REDIRECT";

/** True when `err` is Next's redirect signal rather than a real failure. */
export function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith(MARKER)) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message.startsWith(MARKER);
}
