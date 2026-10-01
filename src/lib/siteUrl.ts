// THE SITE'S CANONICAL ORIGIN (2026-10-01) for what search engines read —
// robots.txt and the sitemap. Not NEXT_PUBLIC_APP_URL: in production that is
// https://jobflex.app, which answers 308 to www, and a sitemap must list the
// addresses that answer 200. Not the request's host either: a preview or the
// *.vercel.app host must still name the production site. NEXT_PUBLIC_SITE_URL
// overrides it if the domain ever moves.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.jobflex.app").replace(/\/+$/, "");
