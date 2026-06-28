import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ToastHost } from "@/components/ui/Toast";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
    <html lang="en" className={geist.variable}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-gr-* attributes on <body> before React hydrates — benign mismatch. */}
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <div className="relative z-10">{children}</div>
        <ToastHost />
      </body>
    </html>
  );
}
