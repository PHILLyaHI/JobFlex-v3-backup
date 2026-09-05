"use client";
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { trafficReady } from "@/lib/traffic-client";
import { TRAFFIC_EXPERIMENTS } from "@/lib/traffic-experiments";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const internal = (path: string) => path === "/admin" || path.startsWith("/admin/");

// SESSION REPLAY IS FOR VISITORS, NOT FOR THE SIGNED-IN APP (owner, 2026-09-05).
// Recording runs on the public surfaces — landing pages, pricing, register and
// login, the homeowner/client portals — and is stopped the moment the route is
// an authenticated one. The gate is the PATH rather than the session: the auth
// cookie is httpOnly and invisible to this script, and the public surfaces are
// public whoever is looking at them. Every input is masked in the recording.
const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/w/", "/mobile-", "/v3", "/studio", "/dev", "/influencer", "/api"];
const recordable = (path: string) =>
  !PRIVATE_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p));

// Preserve attribution, never signup tickets, OAuth handles or Stripe return tokens.
function safeUrl(value: string): string {
  if (!value || value === "$direct") return value;
  try {
    const url = new URL(value, window.location.origin);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (!/^utm_(source|medium|campaign|content|term)$/.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}
function scrubUrls(properties: Record<string, unknown>) {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && /\$(?:(initial_)?(current_url|referrer)|session_entry_url)$/.test(key)) properties[key] = safeUrl(value);
    if ((key === "$set" || key === "$set_once") && value && typeof value === "object") scrubUrls(value as Record<string, unknown>);
  }
}

export function PostHogCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = React.useRef("");

  React.useEffect(() => {
    if (!KEY || posthog.__loaded) return;
    posthog.init(KEY, {
      api_host: HOST, capture_pageview: false, person_profiles: "identified_only",
      capture_pageleave: true, autocapture: false,
      advanced_disable_feature_flags: TRAFFIC_EXPERIMENTS.length === 0,
      // Off at init; the route effect below starts it on public paths only.
      disable_session_recording: true,
      session_recording: { maskAllInputs: true, maskTextSelector: "[data-ph-mask]" },
      before_send: (event) => {
        if (!event || internal(window.location.pathname)) return null;
        scrubUrls(event.properties);
        return event;
      },
    });
  }, []);

  React.useEffect(() => {
    if (!KEY || !pathname || !posthog.__loaded) return;
    if (internal(pathname)) { lastUrl.current = ""; posthog.stopSessionRecording(); return; }
    if (recordable(pathname)) posthog.startSessionRecording();
    else posthog.stopSessionRecording();
    posthog.register({ jf_hostname: window.location.hostname,
      jf_environment: ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "development" : "production" });
    const url = safeUrl(window.location.origin + pathname + (searchParams?.size ? `?${searchParams}` : ""));
    if (lastUrl.current !== url) {
      lastUrl.current = url;
      posthog.capture("$pageview", { $current_url: url, $pathname: pathname });
    }
    trafficReady();
  }, [pathname, searchParams]);
  return null;
}
