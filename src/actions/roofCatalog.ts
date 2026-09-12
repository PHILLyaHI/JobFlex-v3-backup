"use server";

// The organization's roof catalog — the package builder's roof types,
// underlayments and standing prices, shared by everyone in the org.
//
// DEPLOY NOTE: the RoofCatalog table is new (2026-09-12). Until `prisma db
// push` has created it in an environment, getRoofCatalog answers null and
// the builder runs on its built-in defaults plus the browser's own memory;
// saveRoofCatalog reports the failure instead of throwing. Nothing else in
// the app touches the table, so the deploy is safe either way.

import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { roofCatalogSchema, type RoofCatalogDoc } from "@/lib/roofPackage/catalogSchema";

export async function getRoofCatalog(): Promise<RoofCatalogDoc | null> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const row = await db.roofCatalog.findUnique({ where: { organizationId } });
    if (!row) return null;
    return roofCatalogSchema.parse(JSON.parse(row.catalogJson));
  } catch {
    // Table not pushed yet, or a row that no longer validates: defaults it is.
    return null;
  }
}

export async function saveRoofCatalog(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const parsed = roofCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The catalog didn't validate${issue ? ` — ${issue.path.join(".")}: ${issue.message}` : ""}.` };
  }
  const catalogJson = JSON.stringify(parsed.data);
  try {
    await db.roofCatalog.upsert({
      where: { organizationId },
      create: { organizationId, catalogJson },
      update: { catalogJson },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: /does not exist|no such table|relation .* RoofCatalog/i.test(msg)
        ? "The catalog table isn't in this database yet — run `prisma db push`, then save again. Your settings stay in this browser meanwhile."
        : `Couldn't save the catalog — ${msg.slice(0, 200)}`,
    };
  }
}
