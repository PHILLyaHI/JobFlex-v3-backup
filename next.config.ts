import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Content-Security-Policy, REPORT-ONLY for the first release. Enumerated from
// the third parties the code actually loads: Stripe.js + Checkout, PayPal and
// Square JS SDKs, Google Maps JS/static/geocode, PostHog, Vercel Blob images,
// Google avatars. 'unsafe-inline' for script is required by the blueprint
// pages' inline behaviour scripts until a per-request nonce lands; the header
// is Report-Only so a missed host shows up in the console instead of breaking
// checkout on launch day. Promote to Content-Security-Policy once a week of
// reports is clean.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com https://web.squarecdn.com https://sandbox.web.squarecdn.com https://maps.googleapis.com https://us-assets.i.posthog.com https://us.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://places.googleapis.com https://www.paypal.com https://www.sandbox.paypal.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://*.public.blob.vercel-storage.com https://vercel.live wss://ws-us3.pusher.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com https://web.squarecdn.com https://sandbox.web.squarecdn.com https://www.google.com https://vercel.live",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'self'",
  // `upgrade-insecure-requests` is deliberately absent: browsers ignore it in a
  // report-only policy and log a warning on every page. Add it back when this
  // header is promoted to enforcing.
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Do not advertise the framework in every response.
  poweredByHeader: false,
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
    // Turbopack's on-disk dev cache corrupted twice on 2026-09-03 ("Restore of
    // All for task … failed in another thread" panic, then a segfault on the
    // next start) and took the whole dev server down mid-session. Off until
    // Next ships a fix; cold starts are a few seconds slower, nothing else
    // changes. Re-enable by deleting this line (the default is true).
    turbopackFileSystemCacheForDev: false,
    // "Jest worker encountered 2 child process exceptions, exceeding retry
    // limit" — the dev server's static-paths worker, not app code.
    //
    // In dev, Next forks a full child node process (next/dist/server/dev/
    // next-dev-server.js) to evaluate getStaticPaths for each dynamic route,
    // with maxRetries: 1. Two child deaths kill that pool for the LIFE of the
    // server, after which EVERY dynamic route 500s with that message — which is
    // why /api/auth/[...nextauth] started failing and no role could sign in.
    // Only a restart cleared it.
    //
    // workerThreads runs the same worker on worker_threads instead of a forked
    // process: one heap, no stdio pipes (so no `write EPIPE`), and no child to
    // die in the first place.
    //
    // DEV ONLY — see the phase switch at the bottom of this file. `next build`
    // hands its page-generation workers values a structured clone cannot carry
    // (`Error [DataCloneError]: ()=>null could not be cloned`), which fails the
    // build outright; a forked child gets those values over its own channel and
    // is fine. The flag is set per phase rather than deleted because the dev
    // crash it fixes is real.
    workerThreads: false,
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // Baseline HTTP security headers applied to every route. The CSP ships in
  // Report-Only mode first (see CSP_REPORT_ONLY above).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-DNS-Prefetch-Control", value: "on" },
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

// Phase switch. The only per-phase value is experimental.workerThreads: on for
// the dev server, where it stops the static-paths worker from dying and taking
// every dynamic route down with it, and off everywhere else, where it breaks
// `next build`. Everything above is shared.
export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    ...nextConfig,
    experimental: { ...nextConfig.experimental, workerThreads: dev },
  };
}
