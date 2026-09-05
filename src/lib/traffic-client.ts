"use client";

import posthog from "posthog-js";
import { TRAFFIC_EVENTS } from "./traffic-contract";

type EventName = typeof TRAFFIC_EVENTS[keyof typeof TRAFFIC_EVENTS];
type Properties = Record<string, string | number | boolean>;
const queued: { event: EventName; properties: Properties }[] = [];
let available = false;
const readyListeners = new Set<() => void>();
export const isTrafficReady = () => available;
export function onTrafficReady(callback: () => void): () => void {
  readyListeners.add(callback);
  if (available) callback();
  return () => { readyListeners.delete(callback); };
}

/** Registration effects can mount before the root capture provider initializes. */
export function trafficReady() {
  const first = !available;
  available = true;
  for (const item of queued.splice(0)) trackTraffic(item.event, item.properties);
  if (first) for (const callback of readyListeners) callback();
}

export function trackTraffic(event: EventName, properties: Properties = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === "undefined") return;
  if (!available) { if (queued.length < 30) queued.push({ event, properties }); return; }
  if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) return;
  try {
    posthog.capture(event, { ...properties, $pathname: window.location.pathname }, { transport: "sendBeacon", send_instantly: true });
  } catch { /* Analytics must never interrupt signup or checkout. */ }
}

export function trafficIdentity(): { distinctId: string; sessionId: string; hostname: string; environment: string } | undefined {
  if (!available || typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return undefined;
  try {
    return { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id(), hostname: window.location.hostname,
      environment: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "development" : "production" };
  } catch { return undefined; }
}

/** Call only after a future variant has actually rendered. Assignment alone is not exposure. */
export function trackTrafficExperiment(experiment: string, variant: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(experiment) || !/^[a-zA-Z0-9_-]{1,80}$/.test(variant)) return;
  trackTraffic(TRAFFIC_EVENTS.exposure, { experiment, variant });
}
