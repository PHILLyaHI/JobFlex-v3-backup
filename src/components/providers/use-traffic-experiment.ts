"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { TRAFFIC_EXPERIMENTS } from "@/lib/traffic-experiments";
import { onTrafficReady, isTrafficReady, trackTrafficExperiment } from "@/lib/traffic-client";

function subscribe(callback: () => void) {
  let stopFlags: (() => void) | undefined;
  const stopReady = onTrafficReady(() => {
    stopFlags?.();
    stopFlags = posthog.onFeatureFlags(callback);
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
    if (!definition || !isTrafficReady()) return null;
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
    const marker = `${key}:${variant}:${posthog.get_session_id()}`;
    if (exposed.current === marker) return;
    const timer = window.setTimeout(() => {
      exposed.current = marker;
      trackTrafficExperiment(key, variant);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, variant, fallbackKey]);
  return fallbackKey === key ? definition?.variants[0] ?? null : variant;
}
