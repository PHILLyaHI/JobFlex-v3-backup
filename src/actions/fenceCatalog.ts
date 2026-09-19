"use server";

// The organization's fence catalog — the shop's price book, its own fence
// types and standing options, shared by everyone in the org.
//
// DEPLOY NOTE: the FenceCatalog table is new (2026-09-18). Until `prisma db
// push` has created it in an environment, getFenceCatalog answers null and
// the page runs on the catalog's rates plus the browser's own memory;
// saveFenceCatalog reports the failure instead of throwing. Nothing else in
// the app touches the table, so the deploy is safe either way.

import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { fenceCatalogSchema, type FenceCatalogDoc } from "@/lib/fence/catalogSchema";
import { sanitizeRateBook } from "@/lib/fence/rates";

export async function getFenceCatalog(): Promise<FenceCatalogDoc | null> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const row = await db.fenceCatalog.findUnique({ where: { organizationId } });
    if (!row) return null;
    const doc = fenceCatalogSchema.parse(JSON.parse(row.catalogJson));
    return { ...doc, rates: sanitizeRateBook(doc.rates) };
  } catch {
    // Table not pushed yet, or a row that no longer validates: defaults it is.
    return null;
  }
}

export async function saveFenceCatalog(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const parsed = fenceCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The price book didn't validate${issue ? ` — ${issue.path.join(".")}: ${issue.message}` : ""}.` };
  }
  // A value that restates the catalog is not an override: the book stays
  // sparse so a platform-wide rate refresh still reaches every type the
  // shop never deliberately changed.
  const doc: FenceCatalogDoc = { ...parsed.data, rates: sanitizeRateBook(parsed.data.rates) };
  const catalogJson = JSON.stringify(doc);
  try {
    await db.fenceCatalog.upsert({
      where: { organizationId },
      create: { organizationId, catalogJson },
      update: { catalogJson },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: /does not exist|no such table|relation .* FenceCatalog|fenceCatalog/i.test(msg)
        ? "The price book table isn't in this database yet — it lands with the next deploy. Your rates stay in this browser meanwhile."
        : `Couldn't save the price book — ${msg.slice(0, 200)}`,
    };
  }
}
