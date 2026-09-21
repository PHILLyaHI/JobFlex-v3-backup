// SERVER-SIDE POSTHOG EVENTS (2026-09-20) — one fetch to the capture API, no
// SDK. Two users: the error log below (`server_error`) and the activation
// events in lib/activation-events. Same project key and the same host
// allow-list as lib/traffic-capture-server; with no key, everything here is a
// no-op. Nothing in this file touches the database, so the instrumentation
// hook can import it on any runtime.
//
// WHAT NEVER GOES OUT: error messages (Prisma and Stripe put field values in
// theirs), names, emails, addresses, amounts. An error travels as where it
// happened, a code, and the organization it happened to.

import { after } from "next/server";
import { isPlanLimitError } from "@/lib/planLimits";

const HOSTS = ["https://us.i.posthog.com", "https://eu.i.posthog.com"];

type Properties = Record<string, string | number | boolean | null>;

function environment(): "production" | "development" {
  const vercel = process.env.VERCEL_ENV;
  return (vercel ? vercel === "production" : process.env.NODE_ENV === "production") ? "production" : "development";
}

/** One event, awaited. Never throws; a slow PostHog costs at most 2 s. */
export async function captureServerEvent(event: string, distinctId: string, properties: Properties = {}): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || HOSTS[0]).replace(/\/+$/, "");
  if (!token || !HOSTS.includes(host)) return;
  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: token, event, distinct_id: distinctId, timestamp: new Date().toISOString(),
        // No person profile: these are facts about an organization, not a visitor.
        properties: { ...properties, $process_person_profile: false, $lib: "jobflex-server", jf_environment: environment() } }),
      signal: AbortSignal.timeout(2000), cache: "no-store",
    });
    if (!response.ok) console.warn("[server-events] capture rejected", event, response.status);
  } catch { console.warn("[server-events] capture unavailable", event); }
}

/** Runs after the response, so an action or a webhook never waits on analytics.
 *  Call it synchronously from the request. Outside one (a script, a cron
 *  library call) `after` throws: run at once, detached. Never rejects. */
export function afterResponse(work: () => Promise<void>): void {
  const safe = () => work().catch(() => { /* dropped */ });
  try { after(safe); } catch { void safe(); }
}

export function captureServerEventLater(event: string, distinctId: string, properties: Properties = {}): void {
  afterResponse(() => captureServerEvent(event, distinctId, properties));
}

// ── server_error ─────────────────────────────────────────────────────────

export type ServerErrorKind = "action" | "webhook" | "route" | "render" | "proxy" | "cron";
export interface ServerErrorContext {
  kind: ServerErrorKind;
  organizationId?: string | null;
  /** Overrides the code read off the error (an HTTP status, a provider code). */
  code?: string | number;
  digest?: string;
}

/** redirect(), notFound() and the plan-limit signal are control flow, not failures. */
function isControlFlow(error: unknown): boolean {
  if (isPlanLimitError(error)) return true;
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest) : "";
  return /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest);
}

/** Prisma "P2002", Stripe "card_declined", Node "ECONNRESET" — else the error's class. */
function codeOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; statusCode?: unknown; name?: unknown };
    if (typeof e.code === "string" && /^[\w.-]{1,60}$/.test(e.code)) return e.code;
    if (typeof e.statusCode === "number") return String(e.statusCode);
    if (typeof e.name === "string" && e.name) return e.name.slice(0, 60);
  }
  return "unknown";
}

/** The first frame of our own code: a place in the source, never data — and
 *  never the machine's own directories (cut to src/… or the last two segments). */
function whereOf(error: unknown): string {
  const stack = error instanceof Error ? error.stack ?? "" : "";
  const frame = stack.split("\n").slice(1).find((line) => !line.includes("node_modules") && !line.includes("node:"));
  const match = frame?.trim().match(/^(?:at\s+)?(.*?)\s*\(?((?:file:\/\/\/?)?[^\s()]+)\)?$/);
  if (!match) return "";
  const path = match[2].replace(/\\/g, "/");
  const own = path.search(/(src|\.next)\//);
  return `${match[1]} ${own >= 0 ? path.slice(own) : path.split("/").slice(-2).join("/")}`.trim().slice(0, 160);
}

// The wrapper rethrows and Next's onRequestError then sees the same object.
const reported = new WeakSet<object>();

function errorEvent(scope: string, error: unknown, context: ServerErrorContext): { distinctId: string; properties: Properties } | null {
  if (isControlFlow(error)) return null;
  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return null;
    reported.add(error);
  }
  const digest = context.digest ?? (typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "");
  return {
    distinctId: context.organizationId || "server",
    properties: { scope: scope.slice(0, 120), kind: context.kind, code: String(context.code ?? codeOf(error)), where: whereOf(error),
      organizationId: context.organizationId ?? null, ...(digest ? { digest } : {}) },
  };
}

/** THE server error log: the console line operators grep, plus `server_error`
 *  in PostHog. `scope` is the action or route — "proposals.sendProposal",
 *  "webhooks/stripe". Call it from a catch that swallows; use the wrapper
 *  below where the error should keep travelling. */
export function logServerError(scope: string, error: unknown, context: ServerErrorContext): void {
  const event = errorEvent(scope, error, context);
  if (!event) return;
  console.error(`[server-error] ${scope}`, error);
  captureServerEventLater("server_error", event.distinctId, event.properties);
}

/** For Next's onRequestError, which has already logged and wants its work awaited. */
export async function reportServerError(scope: string, error: unknown, context: ServerErrorContext): Promise<void> {
  const event = errorEvent(scope, error, context);
  if (event) await captureServerEvent("server_error", event.distinctId, event.properties);
}

/** Wraps a server action or a route handler: a throw is logged, then rethrown
 *  untouched — redirects, not-founds and plan limits pass through silently.
 *  `organizationId` may read the call's arguments when the caller knows it. */
export function withServerErrorLogging<A extends unknown[], R>(
  scope: string,
  fn: (...args: A) => Promise<R>,
  context: { kind: ServerErrorKind; organizationId?: (...args: A) => string | null | undefined } = { kind: "action" },
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      let organizationId: string | null = null;
      try { organizationId = context.organizationId?.(...args) ?? null; } catch { /* the log must not throw */ }
      logServerError(scope, error, { kind: context.kind, organizationId });
      throw error;
    }
  };
}
