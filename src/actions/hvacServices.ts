"use server";

// THE HVAC SERVICE MENU PAGE — its writes (2026-09-23). Owner: "make those
// services editable." The shop's numbers on the built-in menu live on the
// rate card (HvacRateCard.serviceOverrides, by task id; serviceLaborAdjustPct
// for the whole book) — one JSON document per shop, no schema change. The
// shop's own tasks (HvacRateCard.serviceMenu) are edited and removed here
// too; adding one still goes through the estimator's own action.
// Estimator or manager, the same guard as the rate card.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { DEFAULT_RATE_CARD, normalizeRateCard, type HvacRateCard } from "@/lib/hvac/ledger";
import { SERVICE_MENU, type ServiceOverride } from "@/lib/hvac/serviceMenu";
import { saveHvacServiceTask } from "@/actions/hvacEstimator";

type Ok = { ok: true; card: HvacRateCard };
type Fail = { ok: false; error: string };

async function loadCard(organizationId: string): Promise<HvacRateCard> {
  const row = await db.hvacSettings.findUnique({ where: { organizationId } });
  return normalizeRateCard(row ? JSON.parse(row.rateCardJson) : DEFAULT_RATE_CARD);
}
async function storeCard(organizationId: string, card: HvacRateCard): Promise<void> {
  const rateCardJson = JSON.stringify(card);
  await db.hvacSettings.upsert({ where: { organizationId }, create: { organizationId, rateCardJson }, update: { rateCardJson } });
  revalidatePath("/dashboard/hvac-estimator/services");
  revalidatePath("/dashboard/hvac-estimator");
}
const fail = (err: unknown): Fail => ({ ok: false, error: err instanceof Error && /no such table|does not exist/i.test(err.message) ? "The settings table isn't in this database yet." : err instanceof Error && err.message ? err.message : "Could not save" });

const money = z.number().min(0).max(50_000);
const overrideInput = z.object({
  id: z.string().min(1).max(80),
  /** A number sets the shop's price; null takes it back to the typical. */
  laborUsd: money.nullable().optional(),
  partCostUsd: money.nullable().optional(),
  partName: z.string().max(120).nullable().optional(),
  brands: z.array(z.string().max(40)).max(6).nullable().optional(),
  includes: z.string().max(240).nullable().optional(),
  hidden: z.boolean().optional(),
});

/** The shop's own numbers on one built-in task. Fields left out stay as they are; null clears one. */
export async function setHvacServiceOverride(raw: unknown): Promise<Ok | Fail> {
  const parsed = overrideInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That price did not read as a number." };
  const d = parsed.data;
  if (!SERVICE_MENU.some((t) => t.id === d.id)) return { ok: false, error: "That task is not on the built-in menu." };
  try {
    const { organizationId } = await requireEstimatorOrManager();
    const card = await loadCard(organizationId);
    const cur: ServiceOverride = { ...(card.serviceOverrides?.[d.id] ?? {}) };
    const put = <K extends keyof ServiceOverride>(k: K, v: ServiceOverride[K] | null | undefined) => {
      if (v === undefined) return;
      if (v === null || (Array.isArray(v) && !v.length) || (typeof v === "string" && !v.trim())) delete cur[k];
      else cur[k] = v;
    };
    put("laborUsd", d.laborUsd === undefined ? undefined : d.laborUsd === null ? null : Math.round(d.laborUsd));
    put("partCostUsd", d.partCostUsd === undefined ? undefined : d.partCostUsd === null ? null : Math.round(d.partCostUsd * 100) / 100);
    put("partName", d.partName?.trim());
    put("brands", d.brands?.map((b) => b.trim()).filter(Boolean));
    put("includes", d.includes?.trim());
    if (d.hidden !== undefined) { if (d.hidden) cur.hidden = true; else delete cur.hidden; }
    const next = { ...(card.serviceOverrides ?? {}) };
    if (Object.keys(cur).length) next[d.id] = cur;
    else delete next[d.id];
    card.serviceOverrides = Object.keys(next).length ? next : undefined;
    await storeCard(organizationId, card);
    return { ok: true, card };
  } catch (err) {
    return fail(err);
  }
}

/** Back to the typical numbers for one task (and offered again). */
export async function resetHvacServiceOverride(id: string): Promise<Ok | Fail> {
  try {
    const { organizationId } = await requireEstimatorOrManager();
    const card = await loadCard(organizationId);
    const next = { ...(card.serviceOverrides ?? {}) };
    delete next[String(id).slice(0, 80)];
    card.serviceOverrides = Object.keys(next).length ? next : undefined;
    await storeCard(organizationId, card);
    return { ok: true, card };
  } catch (err) {
    return fail(err);
  }
}

/** The shop's labor against the market's typical, for every built-in task it has not priced itself. */
export async function setHvacServiceLaborAdjust(pct: number): Promise<Ok | Fail> {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < -50 || n > 100) return { ok: false, error: "The adjustment is a percent between −50 and +100." };
  try {
    const { organizationId } = await requireEstimatorOrManager();
    const card = await loadCard(organizationId);
    card.serviceLaborAdjustPct = Math.round(n) || undefined;
    await storeCard(organizationId, card);
    return { ok: true, card };
  } catch (err) {
    return fail(err);
  }
}

const ownTaskInput = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(2).max(120),
  includes: z.string().max(240).optional(),
  laborUsd: money,
  partName: z.string().max(120).optional(),
  partCost: money.optional(),
  brands: z.array(z.string().max(40)).max(6).optional(),
});

/** Edit one of the shop's own tasks in place (the id stays, so estimates that picked it still price). */
export async function updateHvacServiceTask(raw: unknown): Promise<Ok | Fail> {
  const parsed = ownTaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "A task needs a name and a labor price." };
  const d = parsed.data;
  try {
    const { organizationId } = await requireEstimatorOrManager();
    const card = await loadCard(organizationId);
    const list = card.serviceMenu ?? [];
    if (!list.some((t) => t.id === d.id)) return { ok: false, error: "That task is not on your menu any more." };
    card.serviceMenu = list.map((t) => (t.id === d.id ? { id: t.id, group: "custom" as const, title: d.title.trim(), includes: (d.includes ?? "").trim(), laborUsd: Math.round(d.laborUsd), part: d.partName?.trim() ? { name: d.partName.trim(), costUsd: Math.round((d.partCost ?? 0) * 100) / 100, brands: d.brands?.map((b) => b.trim()).filter(Boolean) } : undefined, custom: true as const } : t));
    await storeCard(organizationId, card);
    return { ok: true, card };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteHvacServiceTask(id: string): Promise<Ok | Fail> {
  try {
    const { organizationId } = await requireEstimatorOrManager();
    const card = await loadCard(organizationId);
    card.serviceMenu = (card.serviceMenu ?? []).filter((t) => t.id !== String(id));
    if (!card.serviceMenu.length) card.serviceMenu = undefined;
    await storeCard(organizationId, card);
    return { ok: true, card };
  } catch (err) {
    return fail(err);
  }
}

/** A new own task, from the page's form: the estimator's own action, then the fresh card. */
export async function addHvacServiceTask(raw: unknown): Promise<(Ok & { id: string }) | Fail> {
  const res = await saveHvacServiceTask(raw);
  if (!res.ok) return res;
  revalidatePath("/dashboard/hvac-estimator/services");
  revalidatePath("/dashboard/hvac-estimator");
  return { ok: true, card: res.card, id: res.id };
}

/** The page's plain form, kept for the no-script path. */
export async function addHvacServiceTaskForm(fd: FormData): Promise<void> {
  const num = (k: string) => {
    const n = Number(String(fd.get(k) ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const partName = String(fd.get("partName") ?? "").trim();
  const brands = String(fd.get("brands") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  await saveHvacServiceTask({
    title: String(fd.get("title") ?? "").trim(),
    includes: String(fd.get("includes") ?? "").trim() || undefined,
    laborUsd: num("laborUsd"),
    partName: partName || undefined,
    partCost: partName ? num("partCost") : undefined,
    brands: brands.length ? brands : undefined,
  });
  revalidatePath("/dashboard/hvac-estimator/services");
  revalidatePath("/dashboard/hvac-estimator");
}
