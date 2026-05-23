// V3 ported route registry.
//
// Each entry maps an existing dashboard route to its v3 counterpart. Use
// `v3Link()` to build internal URLs so we can swap entries between v3 and
// the original implementation without hunting through callsites.
//
// IMPORTANT: only add the entry for the page you own — never delete or
// overwrite another agent's entry. If you must edit a sibling entry the
// user will resolve the merge by keeping both.

export const V3_PORTED_ROUTES = {
  // The frontend-design build of the calendar redesign.
  // Lives under app/v3/(dashboard)/calendar-a — the `(dashboard)` segment is
  // a route group, so it does not appear in the URL.
  "calendar-a": "/v3/calendar-a",
} as const;

export type V3RouteKey = keyof typeof V3_PORTED_ROUTES;

export function v3Link(key: V3RouteKey, suffix?: string): string {
  const base = V3_PORTED_ROUTES[key];
  if (!suffix) return base;
  return `${base}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}
