// Overhead reads — server-only, deliberately NOT server actions.
//
// These are keyed by a caller-supplied organizationId, so exporting them from
// a "use server" module would publish an endpoint that reads any org's sheet.
// The page calls them directly instead; the one write the page makes is the
// org-scoped, manager-gated action in actions/overhead.ts.

import { db } from "@/lib/db";
import {
  OVERHEAD_CUSTOM_MAX,
  type OverheadCustomLine,
  type OverheadMonth,
  type OverheadSheet,
} from "@/components/v3/financials-blueprint/financials-data";

/** "2026-08" — the same key `getMonthlyRollup` produces, so a sheet and a
 *  month of job money line up on one lookup. */
export function overheadKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The stored row: the sheet's scalar columns plus the custom lines as the
 *  JSON string SQLite holds them in. */
export type OverheadRow = Omit<OverheadSheet, "custom"> & { customJson: string | null };

/** Parse the custom-lines column defensively. A malformed blob (hand-edited
 *  database, an older client) yields no lines rather than a crashed page; the
 *  next save rewrites it clean. */
export function parseCustomLines(json: string | null | undefined): OverheadCustomLine[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: OverheadCustomLine[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const label = typeof r.label === "string" ? r.label : "";
      const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : 0;
      if (!id) continue;
      out.push({ id, label, amount: Math.max(0, amount) });
      if (out.length >= OVERHEAD_CUSTOM_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Prisma row → the plain shape the client renders. The row also carries the
 *  org id and timestamps; none of those belong on the wire. */
export function toOverheadSheet(row: OverheadRow): OverheadSheet {
  return {
    year: row.year,
    month: row.month,
    rent: row.rent,
    office: row.office,
    insurance: row.insurance,
    vehicles: row.vehicles,
    software: row.software,
    warehouse: row.warehouse,
    utilities: row.utilities,
    other: row.other,
    workers: row.workers,
    workersPct: row.workersPct,
    sales: row.sales,
    salesPct: row.salesPct,
    marketing: row.marketing,
    marketingPct: row.marketingPct,
    custom: parseCustomLines(row.customJson),
  };
}

/** Every sheet the org has saved, keyed "YYYY-MM".
 *
 *  All of them, not a window: a year of sheets is a dozen small rows, and
 *  handing the page the whole set is what lets month-switching be instant with
 *  no round trip. */
export async function getOverheadSheets(
  organizationId: string,
): Promise<Record<string, OverheadSheet>> {
  const rows = await db.monthlyOverhead.findMany({
    where: { organizationId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 240,
  });
  const out: Record<string, OverheadSheet> = {};
  for (const r of rows) out[overheadKey(r.year, r.month)] = toOverheadSheet(r);
  return out;
}

/** Turn `getMonthlyRollup`'s buckets into the month strip the Overhead tab
 *  walks — oldest first, each carrying the net the work cleared. */
export function toOverheadMonths(
  buckets: Array<{ key: string; revenue: number; expenses: number }>,
): OverheadMonth[] {
  return buckets.map((b) => {
    const [y, m] = b.key.split("-").map(Number);
    return {
      key: b.key,
      label: new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      year: y,
      month: m,
      revenue: b.revenue,
      expenses: b.expenses,
      net: b.revenue - b.expenses,
    };
  });
}
