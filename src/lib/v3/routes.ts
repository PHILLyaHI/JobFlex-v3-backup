// Central registry of v3-ported routes. Anything that has a v3 sibling lives
// here so internal links use a single source of truth and we can sweep them
// during the v3 → main port.
export const V3_PORTED_ROUTES = {
  manualBuilderA: "/v3/proposals/manual-builder-a",
} as const;

export type V3RouteKey = keyof typeof V3_PORTED_ROUTES;

/**
 * Resolve a v3 route by key. Pass keys, not raw paths — that way any v3 path
 * rename happens here once instead of being chased across pages.
 */
export function v3Link(route: V3RouteKey): string {
  return V3_PORTED_ROUTES[route];
}
