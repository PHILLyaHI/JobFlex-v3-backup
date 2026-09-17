"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { TRAFFIC_EXPERIMENTS } from "@/lib/traffic-experiments";
import { getPostHog, onTrafficReady, isTrafficReady, trackTrafficExperiment } from "@/lib/traffic-client";

// The PostHog instance comes from the capture provider, which loads the
// library after the page (landing-e pass C, 2026-09-11); before it is ready
// this hook reports "loading" exactly as it did before.
function subscribe(callback: () => void) {
  let stopFlags: (() => void) | undefined;
  const stopReady = onTrafficReady(() => {
    stopFlags?.();
    stopFlags = getPostHog()?.onFeatureFlags(callback);
    callback();
  });
  return () => { stopFlags?.(); stopReady(); };
}

/** Null means loading. On timeout, render the first variant without exposure. */
export function useTrafficExperiment(key: string): string | null {
  const pathname = usePathname();
  const definition = TRAFFIC_EXPERIMENTS.find(e => e.key === key && e.path === pathname);
  const [fallbackKey, setFallbackKey] = useState("");
  const variant = useSyncExternalStore(subscribe, () => {
    const posthog = getPostHog();
    if (!definition || !isTrafficReady() || !posthog) return null;
    const value = posthog.getFeatureFlag(key, { send_event: false, fresh: true });
    return typeof value === "string" && definition.variants.includes(value) ? value : null;
  }, () => null);
  const exposed = useRef("");
  useEffect(() => {
    if (!definition || variant) return;
    const timer = window.setTimeout(() => setFallbackKey(key), 2000);
    return () => window.clearTimeout(timer);
  }, [definition, key, variant]);
  useEffect(() => {
    if (!variant || fallbackKey === key) return;
    const marker = `${key}:${variant}:${getPostHog()?.get_session_id() ?? ""}`;
    if (exposed.current === marker) return;
    const timer = window.setTimeout(() => {
      exposed.current = marker;
      trackTrafficExperiment(key, variant);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, variant, fallbackKey]);
  return fallbackKey === key ? definition?.variants[0] ?? null : variant;
}
