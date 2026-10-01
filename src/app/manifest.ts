import type { MetadataRoute } from "next";

// The web app manifest (2026-10-01): the name and the home-screen icons, the
// same white J on the ink tile as app/icon.png (scripts/brand-icons.mjs).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobFlex",
    short_name: "JobFlex",
    description: "The operating system for contractors — CRM, AI estimating and proposals.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f0eb",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
