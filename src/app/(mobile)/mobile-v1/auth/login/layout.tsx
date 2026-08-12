// Document title + viewport for /mobile-v1/auth/login.
//
// page.tsx is a client component (NextAuth's signIn + useSearchParams), so it
// cannot export `metadata` or `viewport` itself. This layout exists for those
// two exports and renders no DOM of its own — the same split the desktop port
// uses at src/app/(auth)/auth/login/layout.tsx.
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "JobFlex · Sign in",
  description: "Sign in to JobFlex — proposals, jobs and payments for contractors.",
};

// Handheld build: read the layout at true device width and pay out the notch /
// home-indicator insets (the stylesheet consumes them through env()).
//
// DELIBERATELY NO `maximumScale: 1`. The mobile-*-v2 siblings lock the scale;
// that suppresses pinch-zoom, which fails WCAG 2.2 AA 1.4.4 (Resize Text) —
// a hard constraint in DESIGN.md, and a sharper one on a sign-in page where a
// user may need to magnify a mistyped email. The 16px input font-size in
// mobile-auth-login.css is what stops iOS Safari auto-zooming on focus, so the
// scale lock buys nothing here anyway.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function MobileAuthLoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
