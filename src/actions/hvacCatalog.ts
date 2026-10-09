"use server";
// THE CATALOG PAGE'S ACTIONS (2026-10-09) — /dashboard/hvac-estimator/catalog.
//
// Owner: "make a better catalog that can already be used in the USA, per state
// code; editable, their own brands and models; by category lists; make smart."
// The rows are the HvacCatalogItem table (one row per unit, the CatalogItem
// whole in itemJson — no schema change for the new fields). A shop that has
// never touched its catalog is on the built-in US list; the first edit of any
// kind MATERIALISES that list as the shop's own rows (ensureOwn), so a cost, a
// switch or a note lands on a row the shop owns and the estimator keeps
// reading one catalog. The shop's state is a SyncState row; the first guess is
// the state in the company's address.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { requirePage } from "@/lib/customPageAccess";
import { db } from "@/lib/db";
import { stateFromAddress } from "@/lib/pricing/salesTax";
import { US_CATALOG, US_CATALOG_VERIFIED_ON } from "@/lib/hvac/data/usCatalog";
import { STARTER_CATALOG } from "@/lib/hvac/ledger";
import { catalogItemSchema, catalogPatchSchema } from "@/lib/hvac/catalogSchema";
import { offForState, shopItemId } from "@/lib/hvac/catalogView";
import type { CatalogItem } from "@/lib/hvac/types";

type Fail = { ok: false; error: string };
export type CatalogPage = {
  items: CatalogItem[];
  /** The rows are the shop's own (false: the built-in list, untouched). */
  own: boolean;
  source: "shop" | "us" | "starter";
  /** The shop's state for the code checks ("" until picked or read off the address). */
  state: string;
  verifiedOn: string;
  usCount: number;
  /** Rows of the current US list the shop's catalog does not have yet (0 when not own). */
  missingUs: number;
};

const missingTable = (err: unknown) => /does not exist|no such table|relation .* Hvac/i.test(err instanceof Error ? err.message : String(err));
const failed = (what: string, err: unknown): string => (missingTable(err) ? "The catalog table isn't in this database yet — run `prisma db push` first." : `Couldn't ${what}: ${err instanceof Error ? err.message : String(err)}`);
const stateKey = (orgId: string) => `hvacCatalogState:${orgId}`;
const ESTIMATOR = "/dashboard/hvac-estimator";

async function gate(): Promise<string> {
  const { organizationId } = await requireEstimatorOrManager();
  await requirePage(organizationId, "hvac-estimator");
  return organizationId;
}
const toRow = (organizationId: string, item: CatalogItem) => ({ organizationId, itemId: item.id, kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) });
async function readRows(organizationId: string): Promise<CatalogItem[]> {
  const rows = await db.hvacCatalogItem.findMany({ where: { organizationId }, orderBy: [{ kind: "asc" }, { brand: "asc" }, { model: "asc" }] });
  return rows.map((r) => JSON.parse(r.itemJson) as CatalogItem);
}
/** The shop's first edit copies the built-in list into its own rows. True when that just happened. */
async function ensureOwn(organizationId: string): Promise<boolean> {
  const n = await db.hvacCatalogItem.count({ where: { organizationId } });
  if (n > 0) return false;
  const seed = US_CATALOG.length ? US_CATALOG : STARTER_CATALOG;
  await db.hvacCatalogItem.createMany({ data: seed.map((item) => toRow(organizationId, item)) });
  return true;
}
async function readState(organizationId: string): Promise<string> {
  const row = await db.syncState.findUnique({ where: { key: stateKey(organizationId) } }).catch(() => null);
  if (row?.cursor && /^[A-Z]{2}$/.test(row.cursor)) return row.cursor;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { address: true } }).catch(() => null);
  return stateFromAddress(org?.address) ?? "";
}
/** Tidy what a form sends: empty strings gone, a zero cost is no cost, AFUE as a fraction, BTU/h from tons. */
function normalize(item: CatalogItem): CatalogItem {
  const out = { ...item } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined || out[k] === null || out[k] === "") delete out[k];
  const i = out as unknown as CatalogItem;
  i.brand = i.brand.trim(); i.model = i.model.trim();
  if (i.family) i.family = i.family.trim();
  if (i.shopNote) i.shopNote = i.shopNote.trim();
  if (i.cost !== undefined && !(i.cost > 0)) delete i.cost;
  if (i.afue !== undefined && i.afue > 1) i.afue = i.afue / 100;
  if (i.states) i.states = i.states.map((s) => s.toUpperCase());
  if (i.notStates) i.notStates = i.notStates.map((s) => s.toUpperCase());
  const cooling = i.kind === "air-conditioner" || i.kind === "heat-pump" || i.kind === "ductless" || i.kind === "package";
  if (cooling && i.tons && !i.coolingBtuh) i.coolingBtuh = Math.round(i.tons * 12000);
  if ((i.kind === "heat-pump" || i.kind === "ductless") && i.coolingBtuh && !i.heat47Btuh) i.heat47Btuh = i.coolingBtuh;
  if (i.kind === "furnace" || i.kind === "air-handler" || i.kind === "coil") i.ratedStaticInWc = i.ratedStaticInWc ?? 0.5;
  if (i.kind === "furnace" && i.btuInput && !i.maxTons) i.maxTons = i.btuInput <= 45_000 ? 3 : i.btuInput <= 70_000 ? 4 : 5;
  if ((i.kind === "furnace" || (i.kind === "package" && (i.heatKind ?? "gas") === "gas")) && i.noxNgJ === undefined) i.noxNgJ = 40;
  if (!i.offList) delete i.offList;
  return i;
}
async function writeFlags(organizationId: string, ids: string[], off: boolean): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db.hvacCatalogItem.findMany({ where: { organizationId, itemId: { in: ids } } });
  const writes = rows.map((r) => {
    const item = JSON.parse(r.itemJson) as CatalogItem;
    if (off) item.offList = true; else delete item.offList;
    return db.hvacCatalogItem.update({ where: { id: r.id }, data: { itemJson: JSON.stringify(item) } });
  });
  for (let i = 0; i < writes.length; i += 100) await db.$transaction(writes.slice(i, i + 100));
  return writes.length;
}

export async function getHvacCatalogPage(): Promise<CatalogPage> {
  const organizationId = await gate();
  let items: CatalogItem[] = [], own = false, source: CatalogPage["source"] = "us";
  try {
    const rows = await readRows(organizationId);
    if (rows.length) { items = rows; own = true; source = "shop"; }
  } catch { /* table not pushed yet */ }
  if (!own) { items = US_CATALOG.length ? US_CATALOG : STARTER_CATALOG; source = US_CATALOG.length ? "us" : "starter"; }
  const have = new Set(items.map((i) => i.id));
  const missingUs = own ? US_CATALOG.filter((u) => !have.has(u.id)).length : 0;
  return { items, own, source, state: await readState(organizationId), verifiedOn: US_CATALOG_VERIFIED_ON, usCount: US_CATALOG.length, missingUs };
}

export async function setHvacCatalogState(raw: unknown): Promise<{ ok: true; state: string } | Fail> {
  const organizationId = await gate();
  const parsed = z.object({ state: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick a state from the list." };
  const key = stateKey(organizationId);
  try {
    if (parsed.data.state) await db.syncState.upsert({ where: { key }, update: { cursor: parsed.data.state }, create: { key, cursor: parsed.data.state } });
    else await db.syncState.deleteMany({ where: { key } });
    return { ok: true, state: parsed.data.state };
  } catch (err) { return { ok: false, error: failed("save the state", err) }; }
}

/** Change what is on a row — its cost, a rating, the model text, the note, the switch. */
export async function patchHvacCatalogItem(raw: unknown): Promise<{ ok: true; item: CatalogItem; materialized: boolean } | Fail> {
  const organizationId = await gate();
  const parsed = z.object({ itemId: z.string().min(1).max(120), patch: catalogPatchSchema }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That change doesn't fit the row — check the numbers." };
  try {
    const materialized = await ensureOwn(organizationId);
    const row = await db.hvacCatalogItem.findUnique({ where: { organizationId_itemId: { organizationId, itemId: parsed.data.itemId } } });
    if (!row) return { ok: false, error: "That row isn't in your catalog any more — reload the page." };
    const was = JSON.parse(row.itemJson) as CatalogItem;
    const item = normalize({ ...was, ...parsed.data.patch, id: was.id, source: was.source } as CatalogItem);
    await db.hvacCatalogItem.update({ where: { id: row.id }, data: { kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) } });
    revalidatePath(ESTIMATOR);
    return { ok: true, item, materialized };
  } catch (err) { return { ok: false, error: failed("save the row", err) }; }
}

/** A unit the shop sells that the list does not have — its own brand or model. */
export async function addHvacCatalogItem(raw: unknown): Promise<{ ok: true; item: CatalogItem; materialized: boolean } | Fail> {
  const organizationId = await gate();
  const parsed = catalogItemSchema.omit({ id: true, source: true, typed: true }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "The unit is missing something the catalog needs — kind, brand and model at least, and numbers in their fields." };
  const item = normalize({ ...parsed.data, id: shopItemId(parsed.data.kind, parsed.data.brand, parsed.data.model), source: "shop" } as CatalogItem);
  try {
    const materialized = await ensureOwn(organizationId);
    await db.hvacCatalogItem.upsert({
      where: { organizationId_itemId: { organizationId, itemId: item.id } },
      create: toRow(organizationId, item),
      update: { kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) },
    });
    revalidatePath(ESTIMATOR);
    return { ok: true, item, materialized };
  } catch (err) { return { ok: false, error: failed("add the unit", err) }; }
}

export async function deleteHvacCatalogItem(raw: unknown): Promise<{ ok: true; materialized: boolean } | Fail> {
  const organizationId = await gate();
  const parsed = z.object({ itemId: z.string().min(1).max(120) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Which row?" };
  try {
    const materialized = await ensureOwn(organizationId);
    await db.hvacCatalogItem.deleteMany({ where: { organizationId, itemId: parsed.data.itemId } });
    revalidatePath(ESTIMATOR);
    return { ok: true, materialized };
  } catch (err) { return { ok: false, error: failed("remove the row", err) }; }
}

/** The switch on a row, a product line or a whole brand: off the pick list, or back on. */
export async function setHvacCatalogOff(raw: unknown): Promise<{ ok: true; changed: number; items: CatalogItem[] } | Fail> {
  const organizationId = await gate();
  const parsed = z.object({ itemIds: z.array(z.string().min(1).max(120)).min(1).max(2000), off: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Which rows?" };
  try {
    await ensureOwn(organizationId);
    const changed = await writeFlags(organizationId, parsed.data.itemIds, parsed.data.off);
    revalidatePath(ESTIMATOR);
    return { ok: true, changed, items: await readRows(organizationId) };
  } catch (err) { return { ok: false, error: failed("change the switch", err) }; }
}

/** Remember the state, then turn off every row its code rules out (the DOE regional floor, New York's
 *  R-410A ban, the California and Washington GWP caps, a row's own sold-in list). Nothing is turned on. */
export async function setupHvacCatalogForState(raw: unknown): Promise<{ ok: true; state: string; turnedOff: number; examples: string[]; items: CatalogItem[] } | Fail> {
  const organizationId = await gate();
  const parsed = z.object({ state: z.string().trim().toUpperCase().length(2) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Pick a state first." };
  try {
    await ensureOwn(organizationId);
    const key = stateKey(organizationId);
    await db.syncState.upsert({ where: { key }, update: { cursor: parsed.data.state }, create: { key, cursor: parsed.data.state } });
    const rows = await readRows(organizationId);
    const off = offForState(rows, parsed.data.state);
    await writeFlags(organizationId, off.map((i) => i.id), true);
    revalidatePath(ESTIMATOR);
    return { ok: true, state: parsed.data.state, turnedOff: off.length, examples: off.slice(0, 4).map((i) => `${i.brand} ${i.model}`), items: await readRows(organizationId) };
  } catch (err) { return { ok: false, error: failed("set the catalog up", err) }; }
}

export async function setHvacCatalogAllOn(): Promise<{ ok: true; changed: number; items: CatalogItem[] } | Fail> {
  const organizationId = await gate();
  try {
    await ensureOwn(organizationId);
    const rows = await readRows(organizationId);
    const changed = await writeFlags(organizationId, rows.filter((i) => i.offList).map((i) => i.id), false);
    revalidatePath(ESTIMATOR);
    return { ok: true, changed, items: await readRows(organizationId) };
  } catch (err) { return { ok: false, error: failed("turn the rows on", err) }; }
}

/** Rows a newer build of the US list has that the shop's catalog lacks — added, nothing of the shop's touched
 *  (the estimator's own "Load the US catalog" rewrites the US rows, which would drop costs and switches). */
export async function addMissingUsRows(): Promise<{ ok: true; added: number; items: CatalogItem[] } | Fail> {
  const organizationId = await gate();
  try {
    const materialized = await ensureOwn(organizationId);
    let added = 0;
    if (!materialized) {
      const have = new Set((await db.hvacCatalogItem.findMany({ where: { organizationId }, select: { itemId: true } })).map((r) => r.itemId));
      const missing = US_CATALOG.filter((u) => !have.has(u.id));
      if (missing.length) await db.hvacCatalogItem.createMany({ data: missing.map((item) => toRow(organizationId, item)) });
      added = missing.length;
    } else added = US_CATALOG.length;
    revalidatePath(ESTIMATOR);
    return { ok: true, added, items: await readRows(organizationId) };
  } catch (err) { return { ok: false, error: failed("update the US list", err) }; }
}
