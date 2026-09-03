// NOTIFICATION PREFERENCES — the user's matrix, made real.
//
// Stored as `User.notificationPrefsJson`. Two channels per event: in-app
// (does the row show in the bell?) and email (does the office mail go out to
// this member?). Quiet hours and mute-weekends gate EMAIL only — the bell
// keeps a copy — and an email inside the window is DROPPED, not held: there
// is no outbox to hold it in, and the settings copy says exactly that.
//
// THIS FILE IS PURE (no db, no mail) so the settings panes can import the
// event list, the parser and the quiet-hours math into the client bundle.
// The db-backed half (loadPrefs, recipients, senders) is ./notificationPrefs.ts.

export type PrefKey =
  | "lead-assigned"
  | "proposal-viewed"
  | "proposal-accepted"
  | "proposal-declined"
  | "payment-received"
  | "change-order"
  | "job-scheduled"
  | "job-completed"
  | "worker-responded"
  | "review-received"
  | "trade-reply";

export interface PrefEventMeta {
  key: PrefKey;
  name: string;
  sub: string;
  /** False when nothing in the app mails this event — the Email cell is
   *  disabled rather than lying. */
  emailAvailable: boolean;
  /** Seed [inApp, email] for a user who has never saved. */
  seed: [boolean, boolean];
}

/** Every key here has a real producer (an ActivityEvent kind or a notify*
 *  sender). Anything without one was cut from the matrix. */
export const PREF_EVENTS: readonly PrefEventMeta[] = [
  { key: "lead-assigned", name: "New lead", sub: "A platform or web lead lands in your pipeline", emailAvailable: true, seed: [true, true] },
  { key: "proposal-viewed", name: "Proposal viewed", sub: "The client opened your estimate", emailAvailable: false, seed: [true, false] },
  { key: "proposal-accepted", name: "Proposal accepted", sub: "Signed and ready to schedule", emailAvailable: true, seed: [true, true] },
  { key: "proposal-declined", name: "Proposal declined", sub: "With the reason the client gave", emailAvailable: true, seed: [true, true] },
  { key: "payment-received", name: "Payment received", sub: "A stage was paid — card, Square or recorded by hand", emailAvailable: true, seed: [true, true] },
  { key: "change-order", name: "Change order answered", sub: "The client approved or declined it", emailAvailable: false, seed: [true, false] },
  { key: "job-scheduled", name: "Job scheduled", sub: "A crew is booked for a date", emailAvailable: false, seed: [true, false] },
  { key: "job-completed", name: "Job completed", sub: "Crew marked the work done", emailAvailable: false, seed: [true, false] },
  { key: "worker-responded", name: "Worker responded", sub: "Accepted or declined an assignment", emailAvailable: true, seed: [true, true] },
  { key: "review-received", name: "Review received", sub: "A homeowner left a rating", emailAvailable: false, seed: [true, false] },
  { key: "trade-reply", name: "Trade board reply", sub: "Someone answered your post", emailAvailable: true, seed: [true, true] },
];

export type PrefCells = [inApp: boolean, email: boolean];

export interface NotificationPrefs {
  matrix: Record<PrefKey, PrefCells>;
  quietFrom: string; // "20:00"
  quietTo: string; // "07:00"
  muteWeekends: boolean;
}

export const QUIET_FROM_DEFAULT = "20:00";
export const QUIET_TO_DEFAULT = "07:00";

export function defaultNotificationPrefs(): NotificationPrefs {
  const matrix = {} as Record<PrefKey, PrefCells>;
  for (const e of PREF_EVENTS) matrix[e.key] = [e.seed[0], e.seed[1]];
  return { matrix, quietFrom: QUIET_FROM_DEFAULT, quietTo: QUIET_TO_DEFAULT, muteWeekends: false };
}

/** Accepts the current pair shape AND the legacy [inApp, email, sms] triple
 *  (the sms cell is dropped). Unknown keys are ignored; missing ones seed. */
export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!json) return base;
  let raw: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== "object") return base;
    raw = v as Record<string, unknown>;
  } catch {
    return base;
  }
  const stored = raw.matrix && typeof raw.matrix === "object" ? (raw.matrix as Record<string, unknown>) : {};
  for (const e of PREF_EVENTS) {
    const cells = stored[e.key];
    if (Array.isArray(cells) && cells.length >= 2 && typeof cells[0] === "boolean" && typeof cells[1] === "boolean") {
      base.matrix[e.key] = [cells[0], e.emailAvailable ? cells[1] : false];
    }
  }
  const str = (v: unknown, fb: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : fb);
  return {
    matrix: base.matrix,
    quietFrom: str(raw.quietFrom, base.quietFrom),
    quietTo: str(raw.quietTo, base.quietTo),
    muteWeekends: typeof raw.muteWeekends === "boolean" ? raw.muteWeekends : false,
  };
}


// ── kind → preference key ────────────────────────────────────────────────

export interface EventLike {
  kind: string;
  proposalId?: string | null;
  leadId?: string | null;
  meta?: string | null;
  summary?: string | null;
}

/**
 * Which matrix row governs an ActivityEvent. Derived from the real producers
 * (grep `activityEvent.create` under src/actions and src/lib). Unknown kinds
 * return null — those rows always show.
 */
export function prefKeyForEvent(e: EventLike): PrefKey | null {
  const summary = e.summary ?? "";
  const meta = e.meta ?? "";
  switch (e.kind) {
    case "VIEWED":
      return "proposal-viewed";
    case "ACCEPTED":
    case "DECLINED": {
      if (meta.includes("assignmentId")) return "worker-responded";
      if (/change order/i.test(summary)) return "change-order";
      if (/crew invite|marked accepted on|marked declined on/i.test(summary)) return "worker-responded";
      if (e.leadId || /platform lead/i.test(summary)) return null;
      if (e.proposalId) return e.kind === "ACCEPTED" ? "proposal-accepted" : "proposal-declined";
      return null;
    }
    case "CREATED":
      return e.leadId ? "lead-assigned" : null;
    case "SCHEDULED":
      return "job-scheduled";
    case "COMPLETED":
      return "job-completed";
    case "TRADE_CONTACT":
    case "TRADE_INTEREST":
    case "TRADE_HIRED":
      return "trade-reply";
    case "REVIEW":
      return "review-received";
    case "PAYMENT_RECEIVED":
    case "PAYMENT_MARKED":
      return "payment-received";
    default:
      return null;
  }
}

export function allowsInApp(prefs: NotificationPrefs, key: PrefKey | null): boolean {
  if (key === null) return true;
  return prefs.matrix[key]?.[0] ?? true;
}

// ── quiet hours (email only) ─────────────────────────────────────────────

function localParts(now: Date, tz: string): { minutes: number; weekend: boolean } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const h = Number.parseInt(get("hour"), 10) % 24;
    const m = Number.parseInt(get("minute"), 10);
    const wd = get("weekday");
    return { minutes: h * 60 + m, weekend: wd === "Sat" || wd === "Sun" };
  } catch {
    const d = now;
    return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function inQuietHours(prefs: NotificationPrefs, now: Date, tz: string): boolean {
  const { minutes } = localParts(now, tz);
  const from = toMinutes(prefs.quietFrom);
  const to = toMinutes(prefs.quietTo);
  if (from === to) return false;
  // Window wraps midnight when from > to (20:00 → 07:00).
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/**
 * Email goes through whenever the cell is on (owner's call, 2026-09-03: the
 * Delivery card is gone, so quiet hours and the weekend mute no longer gate
 * anything). The stored `quietFrom` / `quietTo` / `muteWeekends` fields are
 * kept in the blob for older rows but are not consulted. `now` / `tz` stay in
 * the signature so the callers need not change.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `now` / `tz` kept for the callers' sake
export function allowsEmail(prefs: NotificationPrefs, key: PrefKey, now?: Date, tz?: string): boolean {
  return prefs.matrix[key]?.[1] ?? false;
}

