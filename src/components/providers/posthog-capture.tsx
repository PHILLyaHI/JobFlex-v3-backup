"use client";
import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

// The send half of the analytics loop. src/lib/posthog.ts is the read half:
// it runs HogQL over `$pageview` events to fill /admin/traffic and the
// visitors tile on /admin. Nothing ever estimates those numbers, so if this
// component does not fire, the admin correctly shows zeros.
//
// Configuration (public — this key is meant to ship to the browser):
//   NEXT_PUBLIC_POSTHOG_KEY   the project API key (phc_…)
//   NEXT_PUBLIC_POSTHOG_HOST  optional, defaults to https://us.i.posthog.com
//
// Unset key = no init, no network, no cookies. That is the local default.
//
// Two deliberate choices:
//  * `capture_pageview: false` — posthog-js only auto-captures the first
//    load, and App Router client navigations never reload. Pageviews are
//    fired manually from the pathname effect below instead, so a route
//    change counts exactly once.
//  * `/admin` is not captured. Those pages ARE the analytics dashboard;
//    counting an admin reading them as site traffic would inflate the very
//    number they are reading.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

function isInternal(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function PostHogCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (!KEY || typeof window === "undefined") return;
    if (posthog.__loaded) return;
    posthog.init(KEY, {
      api_host: HOST,
      // Manual — see the note above.
      capture_pageview: false,
      // Anonymous visitors still get a person_id (so uniq(person_id) in the
      // admin's HogQL is a real visitor count) without creating a stored
      // person profile for every drive-by hit.
      person_profiles: "identified_only",
      capture_pageleave: true,
      // Nothing here reads feature flags, and this is a contractor CRM —
      // skip the per-load /flags/ round trip, and never let a project-side
      // toggle silently start recording customers' screens.
      advanced_disable_feature_flags: true,
      disable_session_recording: true,
    });
  }, []);

  React.useEffect(() => {
    if (!KEY || !pathname || !posthog.__loaded) return;
    if (isInternal(pathname)) return;
    const qs = searchParams?.toString();
    // $current_url / $pathname are what PATHS_SQL groups by, so send them
    // explicitly rather than trusting the auto-property capture on a
    // manually-fired event.
    posthog.capture("$pageview", {
      $current_url: window.location.origin + pathname + (qs ? `?${qs}` : ""),
      $pathname: pathname,
    });
  }, [pathname, searchParams]);

  return null;
}
