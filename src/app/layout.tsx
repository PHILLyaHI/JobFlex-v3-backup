import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastHostLazy } from "@/components/ui/toast-host-lazy";
import { AttributionCapture } from "@/components/attribution-capture";
import { PostHogCapture } from "@/components/providers/posthog-capture";
import { MetaPixel } from "@/components/providers/meta-pixel";
// CookieBanner hidden for now (owner, 2026-09-20) — component untouched,
// just not mounted. Restore: re-add the import and <CookieBanner /> below.
// import { CookieBanner } from "@/components/consent/cookie-banner";

/* Variable fonts — blueprint system needs Inter up to 900 (H1 caps, KPI
   numerals) and JetBrains Mono 500–600 for the drafting-annotation layer. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JobFlex — CRM · AI Estimating · Proposals for contractors",
  description:
    "The modern operating system for contractors. AI-powered proposals, lead pipelines, scheduling, and client portals.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jbMono.variable}`}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-gr-* attributes on <body> before React hydrates — benign mismatch. */}
      {/* No `antialiased`: default subpixel rendering keeps text crisper
          (sharpness pass, owner 2026-08-18). */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <div className="relative z-10">{children}</div>
        {/* Root layout is the one shell every public entry page shares — the
            ?promo/?ref capture must live here to cover them all. Renders null. */}
        <Suspense fallback={null}>
          <AttributionCapture />
        </Suspense>
        {/* Sends the $pageview events that /admin/traffic reads back. Renders
            null and no-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is unset. */}
        <Suspense fallback={null}>
          <PostHogCapture />
        </Suspense>
        {/* Meta Pixel: loads only after marketing consent and only with
            NEXT_PUBLIC_META_PIXEL_ID; PageView on the landing and register
            pages with an eventID the Conversions API deduplicates against. */}
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        <ToastHostLazy />
      </body>
    </html>
  );
}
