// A page that stayed open across a deploy keeps calling the server actions of
// the build it was loaded from. The new build does not have them, and Next
// answers with an error whose only public face is "Minified React error #441"
// (production) or "Failed to find Server Action …" (dev). A contractor read
// that under "Couldn't price the job" on 2026-09-25 and sent a screenshot.
// Nothing is wrong with the job; the page is stale. These helpers turn that
// into words a person can act on, and the screens that price work offer a
// Reload beside them.
//
// Safe to import from client components: no server modules, no React.

const STALE_RE = /Minified React error #441|Server Components render|Failed to find Server Action|older or newer deployment/i;

/** True when an action failed because the page is from an older deployment. */
export function isStaleDeployError(err: unknown): boolean {
  const msg =
    typeof err === "string" ? err : ((err as { message?: unknown } | null)?.message as string | undefined) ?? "";
  return typeof msg === "string" && STALE_RE.test(msg);
}

export const STALE_DEPLOY_TEXT =
  "JobFlex was updated while this page was open, so this screen is out of date. Reload the page and try again.";

/** The error's own words, unless it is the stale-page error, which gets ours. */
export function clientErrorText(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (isStaleDeployError(err)) return STALE_DEPLOY_TEXT;
  const msg = typeof err === "string" ? err : (err as { message?: unknown } | null)?.message;
  return typeof msg === "string" && msg.trim() ? msg.trim() : fallback;
}
