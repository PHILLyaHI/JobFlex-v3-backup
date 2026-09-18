// WHETHER THE OUTSIDE SERVICES ARE ANSWERING — one report, read from the
// admin overview, refreshed nightly and on demand.
//
// WHY THIS EXISTS. lib/sdk/integrations.ts answers one question honestly and
// only one: are the env keys present. That is not health. A ReportAll
// allowance can run dry, an EagleView pack can be denied, a Regrid token
// expires every thirty days and an OPENAI_MODEL can name a model the key's
// project may not call — and every one of those looks exactly like "enabled"
// until a contractor hits it mid-estimate. This module asks the cheapest
// question that distinguishes them, and writes the answer down.
//
// THE RULE EVERY CHECK OBEYS: no check may spend money. Two of them speak to a
// network at all, and both are free endpoints — OpenAI's models.retrieve
// (metadata, no tokens) and SerpAPI's /account (plan info, not a search).
// Everything else reads state this deployment already has: the quota header
// ReportAll answers with, the entitlement rows EagleView probes wrote, the
// last status Regrid returned, the last successful send of each transport.
//
// The report lives in SyncState under HEALTH_KEY, so the overview renders the
// last known answer instantly and nothing is checked on page load.

import { db } from "@/lib/db";
import { QUOTA_KEY as PARCEL_QUOTA_KEY, QUOTA_FLOOR } from "@/lib/parcelLookup";
import { QUOTA_ALLTIME } from "@/lib/reportall";
import { isReportAllEnabled } from "@/lib/reportall";
import { isRegridEnabled } from "@/lib/parcel";
import { isEagleViewEnabled } from "@/lib/eagleview";
import { isOpenAIEnabled, getOpenAI, getOpenAIModel } from "@/lib/sdk/openai";
import { isResendEnabled, isEmailEnabled } from "@/lib/sdk/resend";
import { isSmtpEnabled } from "@/lib/sdk/smtp";
import { isTwilioEnabled } from "@/lib/sdk/twilio";

/** Where the report is kept, and the keys the checks read. */
export const HEALTH_KEY = "integrations:health";
const ALERT_KEY = "integrations:health-alerted";
/** Written by lib/parcel on every Regrid answer; see REGRID_STATUS_KEY there. */
export const REGRID_STATUS_KEY = "regrid:last-status";
/** Written by the mail and SMS transports on every successful send. */
export const EMAIL_SENT_KEY = "email:last-sent";
export const SMS_SENT_KEY = "sms:last-sent";

/** `off` is not a failure: the service is not configured in this environment
 *  and nothing depends on it here. It is reported, never alerted on. */
export type HealthLevel = "ok" | "degraded" | "down" | "off";

export interface ServiceHealth {
  key: string;
  name: string;
  level: HealthLevel;
  /** One line, the shortest true statement of what the check found. */
  reason: string;
  /**
   * NOT LOAD-BEARING. A service nothing waits on: its level is reported as
   * found, but it is counted apart in the verdict and never wakes anybody at
   * 04:40. Regrid is the case this exists for — since the roof measurement
   * took its lot boundary from ParcelCache/ReportAll (lib/lotRing), Regrid is
   * asked only when ReportAll says a point has no parcel at all, so an expired
   * token is a job for this week, not an outage. Calling it one would teach
   * everyone to ignore the panel.
   */
  optional?: boolean;
  /** What the tag beside the name says, when there is one. */
  note?: string;
  /** When the state behind `reason` was established (a quota header's date, a
   *  last send), when that is older than the check itself. */
  asOf?: string;
  checkedAt: string;
}

export interface HealthReport {
  ranAt: string;
  /** How long the whole sweep took, so a slow service is visible as slow. */
  tookMs: number;
  worst: HealthLevel;
  services: ServiceHealth[];
}

const RANK: Record<HealthLevel, number> = { ok: 0, off: 1, degraded: 2, down: 3 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** The allowance is stale after this long without a call refreshing it. */
const QUOTA_STALE_DAYS = 7;
/** A transport that has not sent anything in this long is worth a second look. */
const SEND_QUIET_DAYS = 30;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

async function readState(key: string) {
  return db.syncState.findUnique({ where: { key } }).catch(() => null);
}

/* ── OpenAI ────────────────────────────────────────────────────────────────
   models.retrieve on the model the environment names. Free: it returns the
   model's metadata, not a completion. A 403 or 404 here is the failure that
   used to surface as a broken estimator, so it is reported with the name. */
async function checkOpenAI(now: string): Promise<ServiceHealth> {
  const base = { key: "openai", name: "OpenAI", checkedAt: now };
  if (!isOpenAIEnabled()) return { ...base, level: "off", reason: "OPENAI_API_KEY is not set" };
  const model = getOpenAIModel();
  try {
    await getOpenAI().models.retrieve(model);
    return { ...base, level: "ok", reason: `${model} available` };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const code = (err as { code?: string })?.code;
    if (status === 403 || status === 404 || code === "model_not_found") {
      return { ...base, level: "down", reason: `this project may not call ${model} (${status ?? "403"})` };
    }
    if (status === 401) return { ...base, level: "down", reason: "the key was rejected (401)" };
    return { ...base, level: "degraded", reason: `could not verify ${model}${status ? ` (${status})` : ""}` };
  }
}

/* ── SerpAPI ───────────────────────────────────────────────────────────────
   /account, which reports the plan and what is left on it. It is not a search
   and costs nothing; a search would. */
async function checkSerpApi(now: string): Promise<ServiceHealth> {
  const base = { key: "serpapi", name: "SerpAPI", checkedAt: now };
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return { ...base, level: "off", reason: "SERPAPI_API_KEY is not set" };
  try {
    const res = await fetch(`https://serpapi.com/account?api_key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { ...base, level: "down", reason: `the key was rejected (${res.status})` };
    }
    if (!res.ok) return { ...base, level: "degraded", reason: `account endpoint answered ${res.status}` };
    const acct = (await res.json()) as {
      plan_name?: string;
      total_searches_left?: number;
      plan_searches_left?: number;
      this_month_usage?: number;
    };
    const left = acct.total_searches_left ?? acct.plan_searches_left;
    if (typeof left !== "number") return { ...base, level: "degraded", reason: "account answered without a balance" };
    const plan = acct.plan_name ? `${acct.plan_name}, ` : "";
    if (left <= 0) return { ...base, level: "down", reason: `${plan}no searches left` };
    if (left < 100) return { ...base, level: "degraded", reason: `${plan}${left} searches left` };
    return { ...base, level: "ok", reason: `${plan}${left} searches left` };
  } catch (err) {
    return { ...base, level: "degraded", reason: `account endpoint unreachable: ${short(err)}` };
  }
}

/* ── ReportAll ─────────────────────────────────────────────────────────────
   Read, never asked: the allowance is ALLTIME and the only statement of it is
   the header every parcel lookup answers with, which lib/reportall writes to
   SyncState. Asking for the figure would spend one of the lookups it counts. */
async function checkReportAll(now: string): Promise<ServiceHealth> {
  const base = { key: "reportall", name: "ReportAll", checkedAt: now };
  if (!isReportAllEnabled()) return { ...base, level: "off", reason: "REPORTALL_CLIENT_KEY is not set" };
  const row = await readState(PARCEL_QUOTA_KEY);
  if (!row) return { ...base, level: "degraded", reason: "no lookup has answered on this deployment yet" };
  const left = Number(row.cursor);
  const stale = Date.now() - row.updatedAt.getTime() > QUOTA_STALE_DAYS * DAY_MS;
  const asOf = iso(row.updatedAt);
  const read = `${Number.isFinite(left) ? left : "?"} of ${QUOTA_ALLTIME} lookups left, read ${ago(row.updatedAt)}`;
  if (Number.isFinite(left) && left < QUOTA_FLOOR) {
    return { ...base, level: "down", asOf, reason: `${read} — below the ${QUOTA_FLOOR} reserve, lookups are paused` };
  }
  if (Number.isFinite(left) && left < 300) return { ...base, level: "degraded", asOf, reason: read };
  if (stale) return { ...base, level: "degraded", asOf, reason: `${read} — the figure is a memory, not a reading` };
  return { ...base, level: "ok", asOf, reason: read };
}

/* ── EagleView ─────────────────────────────────────────────────────────────
   The entitlement table is the verdict of probes that were already paid for;
   reading it costs nothing and asking again would cost a report. */
async function checkEagleView(now: string): Promise<ServiceHealth> {
  const base = { key: "eagleview", name: "EagleView", checkedAt: now };
  if (!isEagleViewEnabled()) return { ...base, level: "off", reason: "EagleView credentials are not set" };
  const rows = await db.eagleViewEntitlement.findMany().catch(() => []);
  if (!rows.length) return { ...base, level: "degraded", reason: "no pack has been probed yet" };
  const live = rows.filter((r) => r.status === "live").length;
  const denied = rows.filter((r) => r.status === "denied").length;
  const last = rows.reduce((a, r) => (r.checkedAt > a ? r.checkedAt : a), rows[0].checkedAt);
  const read = `${live} live, ${denied} denied · last verdict ${ago(last)}`;
  const asOf = iso(last);
  if (live === 0) return { ...base, level: "down", asOf, reason: `${read} — nothing is entitled` };
  if (denied > 0) return { ...base, level: "degraded", asOf, reason: read };
  return { ...base, level: "ok", asOf, reason: read };
}

/* ── Regrid ────────────────────────────────────────────────────────────────
   The last status a Regrid call came back with, written by lib/parcel. Its
   tokens are 30-day JWTs, so a working integration expires on a schedule and
   the failure looks like "this address has no parcel" unless somebody says
   otherwise. Nothing is called here. */
async function checkRegrid(now: string): Promise<ServiceHealth> {
  const base = {
    key: "regrid",
    name: "Regrid",
    checkedAt: now,
    optional: true,
    note: "optional · last-resort fallback",
  };
  if (!isRegridEnabled()) return { ...base, level: "off", reason: "REGRID_API_KEY is not set" };
  const row = await readState(REGRID_STATUS_KEY);
  if (!row) return { ...base, level: "degraded", reason: "no call has been made on this deployment yet" };
  const status = Number(row.cursor);
  const asOf = iso(row.updatedAt);
  const when = ago(row.updatedAt);
  if (status === 401 || status === 403) {
    return { ...base, level: "down", asOf, reason: `token rejected (${status}) ${when} — Regrid issues 30-day JWTs` };
  }
  if (status === 200) return { ...base, level: "ok", asOf, reason: `last answer 200, ${when}` };
  return { ...base, level: "degraded", asOf, reason: `last answer ${row.cursor}, ${when}` };
}

/* ── Mail ──────────────────────────────────────────────────────────────────
   Which transport is configured, and when one of them last got something out.
   Nothing is sent: a health check that emails to prove email works would put a
   message in somebody's inbox every night. */
async function checkMail(now: string): Promise<ServiceHealth> {
  const base = { key: "email", name: "Email", checkedAt: now };
  const transport = isResendEnabled() ? "Resend" : isSmtpEnabled() ? "SMTP" : null;
  if (!isEmailEnabled() || !transport) {
    return { ...base, level: "off", reason: "neither RESEND_API_KEY nor the SMTP_* block is set" };
  }
  const row = await readState(EMAIL_SENT_KEY);
  if (!row) return { ...base, level: "degraded", reason: `${transport} configured — nothing sent yet` };
  const quiet = Date.now() - row.updatedAt.getTime() > SEND_QUIET_DAYS * DAY_MS;
  const asOf = iso(row.updatedAt);
  const read = `${transport} · last sent ${ago(row.updatedAt)}`;
  return { ...base, level: quiet ? "degraded" : "ok", asOf, reason: quiet ? `${read} — quiet for a month` : read };
}

/* ── Twilio ────────────────────────────────────────────────────────────────
   Same shape, same reason for not sending anything. */
async function checkTwilio(now: string): Promise<ServiceHealth> {
  const base = { key: "twilio", name: "Twilio", checkedAt: now };
  if (!isTwilioEnabled()) return { ...base, level: "off", reason: "TWILIO_* is not set" };
  const row = await readState(SMS_SENT_KEY);
  if (!row) return { ...base, level: "degraded", reason: "configured — nothing sent yet" };
  const quiet = Date.now() - row.updatedAt.getTime() > SEND_QUIET_DAYS * DAY_MS;
  const asOf = iso(row.updatedAt);
  const read = `last sent ${ago(row.updatedAt)}`;
  return { ...base, level: quiet ? "degraded" : "ok", asOf, reason: quiet ? `${read} — quiet for a month` : read };
}

function short(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 80);
}

/** Runs every check, writes the report, and returns it. Never throws: a health
 *  check that can fail is one more thing to watch. */
export async function runIntegrationsHealth(): Promise<HealthReport> {
  const started = Date.now();
  const now = new Date().toISOString();
  const settled = await Promise.all(
    [checkOpenAI, checkSerpApi, checkReportAll, checkEagleView, checkRegrid, checkMail, checkTwilio].map((fn) =>
      fn(now).catch(
        (err): ServiceHealth => ({
          key: fn.name,
          name: fn.name.replace(/^check/, ""),
          level: "degraded",
          reason: `the check itself failed: ${short(err)}`,
          checkedAt: now,
        }),
      ),
    ),
  );
  // The headline is about what is load-bearing: an optional service that is
  // down must not make the whole platform read as down.
  const worst = settled
    .filter((s) => !s.optional)
    .reduce<HealthLevel>((a, s) => (RANK[s.level] > RANK[a] ? s.level : a), "ok");
  const report: HealthReport = { ranAt: now, tookMs: Date.now() - started, worst, services: settled };
  await db.syncState
    .upsert({
      where: { key: HEALTH_KEY },
      update: { cursor: JSON.stringify(report) },
      create: { key: HEALTH_KEY, cursor: JSON.stringify(report) },
    })
    .catch((err) => console.warn("[integrationsHealth] could not store the report:", err));
  return report;
}

/** The last stored report, or null when nothing has run yet. */
export async function readIntegrationsHealth(): Promise<HealthReport | null> {
  const row = await readState(HEALTH_KEY);
  if (!row) return null;
  try {
    return JSON.parse(row.cursor) as HealthReport;
  } catch {
    return null;
  }
}

/**
 * One email a day, and only while something is down.
 *
 * `off` and `degraded` never wake anybody: a service nobody configured is not
 * an incident, and a low allowance is a decision to make this week, not at
 * 04:00. The stamp is written whether or not the mail got out, so a broken
 * transport cannot turn a nightly alert into a nightly loop.
 */
export async function alertIfDown(report: HealthReport): Promise<"sent" | "already-today" | "nothing-down"> {
  // Optional services are excluded on purpose — see ServiceHealth.optional.
  const down = report.services.filter((s) => s.level === "down" && !s.optional);
  if (!down.length) return "nothing-down";
  const today = report.ranAt.slice(0, 10);
  const stamp = await readState(ALERT_KEY);
  if (stamp?.cursor === today) return "already-today";

  const { sendEmail } = await import("@/lib/sdk/resend");
  const { platformAlertRecipients } = await import("@/lib/integrationsAlertRecipients");
  const to = await platformAlertRecipients();
  const rows = down
    .map((s) => `<li><b>${s.name}</b> — ${s.reason}</li>`)
    .join("");
  const others = report.services
    .filter((s) => s.level !== "down")
    .map((s) => `${s.name}: ${s.level}`)
    .join(" · ");
  try {
    if (to.length) {
      await sendEmail({
        to,
        subject: `JobFlex — ${down.length} integration${down.length === 1 ? "" : "s"} down`,
        html:
          `<p>The nightly integration check found ${down.length} service${down.length === 1 ? "" : "s"} down.</p>` +
          `<ul>${rows}</ul>` +
          `<p style="color:#555">${others}</p>` +
          `<p style="color:#555">Checked ${report.ranAt}. Admin → Overview has the full panel.</p>`,
      });
    }
  } catch (err) {
    console.warn("[integrationsHealth] alert email failed:", err);
  }
  await db.syncState
    .upsert({ where: { key: ALERT_KEY }, update: { cursor: today }, create: { key: ALERT_KEY, cursor: today } })
    .catch(() => {});
  return "sent";
}
