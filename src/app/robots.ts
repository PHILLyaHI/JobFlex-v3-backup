import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// robots.txt (2026-10-01): the public site is open, the app behind a sign-in
// is not — the dashboard, the admin, the API, the worker portal's token links
// (/w/<token>) and the sign-in pages. The icons and the manifest stay open.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api", "/w/", "/auth"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
