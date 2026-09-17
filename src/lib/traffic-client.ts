"use client";

import type { PostHog } from "posthog-js";
import { TRAFFIC_EVENTS } from "./traffic-contract";

/* posthog-js is NOT imported here (landing-e pass C, 2026-09-11): it is a
   259 KB script, and a static import from this module put it in every page
   that tracks a click. The root capture provider loads it on its own
   schedule and hands the instance over through `trafficReady(instance)`;
   until then events queue as they always did. */

type EventName = typeof TRAFFIC_EVENTS[keyof typeof TRAFFIC_EVENTS];
type Properties = Record<string, string | number | boolean>;
const queued: { event: EventName; properties: Properties }[] = [];
let available = false;
let client: PostHog | null = null;
const readyListeners = new Set<() => void>();
export const isTrafficReady = () => available;
/** The loaded PostHog instance, or null before the provider has brought it in. */
export const getPostHog = () => client;
export function onTrafficReady(callback: () => void): () => void {
  readyListeners.add(callback);
  if (available) callback();
  return () => { readyListeners.delete(callback); };
}

/** Registration effects can mount before the root capture provider initializes. */
export function trafficReady(instance?: PostHog) {
  if (instance) client = instance;
  if (!client) return;
  const first = !available;
  available = true;
  for (const item of queued.splice(0)) trackTraffic(item.event, item.properties);
  if (first) for (const callback of readyListeners) callback();
}

export function trackTraffic(event: EventName, properties: Properties = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === "undefined") return;
  if (!available || !client) { if (queued.length < 30) queued.push({ event, properties }); return; }
  if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) return;
  try {
    client.capture(event, { ...properties, $pathname: window.location.pathname }, { transport: "sendBeacon", send_instantly: true });
  } catch { /* Analytics must never interrupt signup or checkout. */ }
}

/* A CLICK THAT BEATS THE LIBRARY (landing-e pass C, 2026-09-11). posthog-js
   now loads after the page; a CTA click in the first seconds queues its
   event and then navigates away, and an in-memory queue would go with it.
   On pagehide (and when the tab is hidden) any queued events are sent by
   beacon straight to the capture endpoint, under the same distinct_id
   posthog-js will adopt when it loads on the next page: the id is written
   into the persistence record the library reads at init. */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
/** A v4 UUID; `crypto.randomUUID` needs a secure context, a LAN address is not one. */
function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function distinctId(): string {
  const name = `ph_${KEY}_posthog`;
  try {
    const raw = localStorage.getItem(name);
    const rec = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    if (typeof rec.distinct_id === "string" && rec.distinct_id) return rec.distinct_id;
    const id = uuid();
    localStorage.setItem(name, JSON.stringify({ ...rec, distinct_id: id, $device_id: id }));
    return id;
  } catch {
    return uuid();
  }
}
function flushByBeacon() {
  if (!KEY || available || !queued.length || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const path = window.location.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) { queued.length = 0; return; }
  const id = distinctId();
  const now = new Date().toISOString();
  const batch = queued.splice(0).map((q) => ({
    event: q.event,
    properties: { ...q.properties, $pathname: path, $current_url: window.location.href.split("#")[0], $lib: "web", $lib_version: "beacon", distinct_id: id, jf_hostname: window.location.hostname },
    timestamp: now,
  }));
  try {
    navigator.sendBeacon(`${HOST.replace(/\/$/, "")}/e/?ip=1&_=${Date.now()}`, new Blob([JSON.stringify({ api_key: KEY, batch })], { type: "text/plain" }));
  } catch { /* nothing to do */ }
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushByBeacon);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushByBeacon(); });
}

export function trafficIdentity(): { distinctId: string; sessionId: string; hostname: string; environment: string } | undefined {
  if (!available || !client || typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return undefined;
  try {
    return { distinctId: client.get_distinct_id(), sessionId: client.get_session_id(), hostname: window.location.hostname,
      environment: window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "development" : "production" };
  } catch { return undefined; }
}

/** Call only after a future variant has actually rendered. Assignment alone is not exposure. */
export function trackTrafficExperiment(experiment: string, variant: string) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(experiment) || !/^[a-zA-Z0-9_-]{1,80}$/.test(variant)) return;
  trackTraffic(TRAFFIC_EVENTS.exposure, { experiment, variant });
}
