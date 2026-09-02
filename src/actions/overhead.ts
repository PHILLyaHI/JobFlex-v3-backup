"use server";

// Monthly overhead — the ONE write the Overhead tab makes.
//
// Per-job math already lives in actions/financials.ts: revenue is PAID
// payments, expenses are JobExpense rows, profit is the difference. That
// answers "did the work pay" but not "did the company pay", because rent,
// insurance, the truck and the software never touch a job. This is the other
// half's write path; the reads are server-only and live in lib/overhead.ts
// (an exported function in a "use server" file is a public endpoint, and a
// read keyed by a caller-supplied organizationId must never be one).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { toOverheadSheet } from "@/lib/overhead";
import {
  OVERHEAD_CUSTOM_MAX,
  type OverheadSheet,
} from "@/components/v3/financials-blueprint/financials-data";

/** A dollar figure typed into the sheet. Negative overhead is not a thing, and
 *  an unreasonable number is far likelier to be a typo than a real cost. */
const money = z.number().finite().min(0).max(100_000_000);

const sheetInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),

  rent: money,
  office: money,
  insurance: money,
  vehicles: money,
  software: money,
  warehouse: money,
  utilities: money,
  other: money,

  // A percent line is capped at 100 by the same parse: `money` allows far more,
  // so the percent ceiling is applied here where the flag is known.
  workers: money,
  workersPct: z.boolean(),
  sales: money,
  salesPct: z.boolean(),
  marketing: money,
  marketingPct: z.boolean(),

  // The contractor's own fixed lines. Bounded on every axis: count, label
  // length and amount — this is a worksheet cell, not a note field.
  custom: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        label: z.string().trim().max(40),
        amount: money,
      }),
    )
    .max(OVERHEAD_CUSTOM_MAX)
    .default([]),
});

export type SaveOverheadInput = z.infer<typeof sheetInput>;

/** Write one month's sheet. Upsert, not create: a month is edited many times
 *  and the unique key is the month itself, so re-saving replaces rather than
 *  stacking duplicate sheets for the same period. */
export async function saveMonthlyOverhead(raw: unknown): Promise<OverheadSheet> {
  const { organizationId } = await requireManager();
  const data = sheetInput.parse(raw);
  const { year, month, custom, ...values } = data;

  // A line with neither a name nor a figure is an abandoned "Add a line"
  // click, not a cost. Dropped here so it does not come back on reload.
  const customJson = JSON.stringify(custom.filter((c) => c.label || c.amount > 0));

  // A percent cannot exceed the whole of revenue. Clamped rather than rejected:
  // the input is a slider-ish number field and 120 is a slip, not an attack.
  if (values.workersPct) values.workers = Math.min(values.workers, 100);
  if (values.salesPct) values.sales = Math.min(values.sales, 100);
  if (values.marketingPct) values.marketing = Math.min(values.marketing, 100);

  const row = await db.monthlyOverhead.upsert({
    where: { organizationId_year_month: { organizationId, year, month } },
    create: { organizationId, year, month, ...values, customJson },
    update: { ...values, customJson },
  });

  revalidatePath("/dashboard/financials");
  return toOverheadSheet(row);
}
