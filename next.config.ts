import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Deployment skew protection. A phone that loaded the app from one build and
  // is still open when the next one ships will, on its next navigation, ask the
  // CDN for a chunk filename only the old build ever emitted — a 404 that
  // surfaces to the user as "Application error: a client-side exception has
  // occurred", because the lazy import for the route it was mounting never
  // arrived. This app is unusually exposed to that: the handheld half of every
  // promoted route is a `dynamic(…, { ssr: false })` chunk fetched at
  // navigation time, so on a phone almost every page change is a chunk fetch.
  //
  // Stamping the build's deployment id onto asset requests lets Vercel route
  // them back to the deployment that owns them, and makes Next hard-navigate
  // instead of throwing when the ids disagree. Only set on Vercel: locally the
  // env var is absent, the key stays off, and dev keeps its normal build ids.
  //
  // The routing half needs Skew Protection switched ON in the Vercel project
  // (Settings → Advanced, or `vercel project protection enable --skew`) —
  // without it the old chunk URL still 404s and only the hard-navigate applies.
  // Config and setting are two halves of one fix; do not remove one alone.
  ...(process.env.VERCEL_DEPLOYMENT_ID
    ? { deploymentId: process.env.VERCEL_DEPLOYMENT_ID }
    : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // Baseline HTTP security headers applied to every route. Content-Security-Policy
  // is intentionally NOT set here — it needs per-service tuning (Google Maps,
  // Stripe, Vercel Blob, etc.) and will be added in a separate change.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
