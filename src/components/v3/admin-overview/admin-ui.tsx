"use client";

// ADMIN — the few bits of markup all three admin pages share.

import s from "./admin-shared.module.css";

export function Ic({ id }: { id: string }) {
  return (
    <svg className="ic" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** Subscription status → the 3-tone status vocabulary. Statuses only. */
export function statusChipClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "chip ok";
    case "TRIALING":
      return `chip ${s.chipInfo}`;
    case "PAST_DUE":
    case "INCOMPLETE":
      return "chip wait";
    case "UNPAID":
      return `chip ${s.chipDanger}`;
    default:
      return `chip ${s.chipMuted}`;
  }
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function StatusChip({ status }: { status: string }) {
  return <span className={statusChipClass(status)}>{statusLabel(status)}</span>;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** Month + day in UTC — identical on server and client, so it hydrates clean. */
export function shortDay(d: string | Date): string {
  return DAY.format(new Date(d));
}

/** lib/format's relative(), anchored on a server-supplied clock instead of
 *  Date.now() so the SSR text and the hydration text agree. */
export function ago(d: string, now: string): string {
  const diff = (new Date(now).getTime() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return shortDay(d);
}
export function mdLabel(isoDate: string): string {
  // "YYYY-MM-DD" → "M/D" without a timezone shift.
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}
