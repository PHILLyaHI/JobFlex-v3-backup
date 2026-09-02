"use server";

import { revalidatePath } from "next/cache";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  isEagleViewEnabled,
  getAvailableProducts,
  priceOrder,
  placeOrder,
  getReportSummary,
  getMeasurementModel,
  runEagleViewDiagnostics,
  type RoofModel,
  type EvOrderInput,
  type EvProduct,
  type EvDiagnostics,
} from "@/lib/eagleview";

// NOTE: EV_SAMPLES (sample report ids) lives in ./roofViz (a client-safe module)
// — a "use server" file may only export async functions, so a const array here
// becomes a server-action reference on the client and breaks (.map is not a fn).

export async function evEnabled(): Promise<boolean> {
  await requireEstimatorOrManager();
  return isEagleViewEnabled();
}

// Connection health for the roof estimator's "Diagnostics" button. Auth-gated to
// estimators/managers; returns non-secret status (hosts, HTTP codes, errors).
export async function evDiagnostics(): Promise<
  { ok: true; diag: EvDiagnostics } | { ok: false; error: string }
> {
  await requireEstimatorOrManager();
  try {
    return { ok: true, diag: await runEagleViewDiagnostics() };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Diagnostics failed" };
  }
}

export async function evProducts(): Promise<
  { ok: true; products: EvProduct[] } | { ok: false; error: string }
> {
  await requireEstimatorOrManager();
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  try {
    return { ok: true, products: await getAvailableProducts() };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Couldn't load products" };
  }
}

// Fetch + parse a roof model by reportId, cached per-org so a paid report is
// only fetched/parsed once. Reads are tenant-scoped via requireEstimatorOrManager().
export async function evRoofModel(
  reportId: number,
): Promise<{ ok: true; model: RoofModel; cached: boolean; totalCost: number | null } | { ok: false; error: string }> {
  const { organizationId, user } = await requireEstimatorOrManager();
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  if (!Number.isFinite(reportId)) return { ok: false, error: "Invalid report id" };
  try {
    const cachedRow = await db.eagleViewReport.findUnique({
      where: { organizationId_reportId: { organizationId, reportId } },
    });
    if (cachedRow?.modelJson) {
      return {
        ok: true,
        model: JSON.parse(cachedRow.modelJson) as RoofModel,
        cached: true,
        totalCost: cachedRow.totalCost ?? null,
      };
    }

    const model = await getMeasurementModel(reportId);
    let summary: Awaited<ReturnType<typeof getReportSummary>> | null = null;
    try {
      summary = await getReportSummary(reportId);
    } catch {
      // Summary is best-effort; the geometry alone is enough to render.
    }

    await db.eagleViewReport.upsert({
      where: { organizationId_reportId: { organizationId, reportId } },
      create: {
        organizationId,
        reportId,
        orderedById: user.id,
        status: summary?.status || "Completed",
        statusId: summary?.statusId ?? null,
        address: model.location.address ?? summary?.street ?? null,
        city: model.location.city ?? summary?.city ?? null,
        state: model.location.state ?? summary?.state ?? null,
        zip: model.location.postal ?? summary?.zip ?? null,
        lat: model.location.lat ?? null,
        lng: model.location.lng ?? null,
        totalCost: summary?.totalCost ?? null,
        areaSqft: model.totals.areaSqft,
        squares: model.totals.squares,
        predominantPitch: String(model.totals.predominantPitch),
        facetCount: model.totals.facetCount,
        modelJson: JSON.stringify(model),
        summaryJson: summary ? JSON.stringify(summary.raw) : null,
      },
      update: {
        modelJson: JSON.stringify(model),
        areaSqft: model.totals.areaSqft,
        squares: model.totals.squares,
        predominantPitch: String(model.totals.predominantPitch),
        facetCount: model.totals.facetCount,
        ...(summary ? { totalCost: summary.totalCost, status: summary.status } : {}),
      },
    });

    return { ok: true, model, cached: false, totalCost: summary?.totalCost ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Couldn't load the roof model" };
  }
}

// Price a roof at an address WITHOUT placing an order — no charge.
export async function evPriceRoof(
  input: EvOrderInput,
): Promise<{ ok: true; price: unknown } | { ok: false; error: string }> {
  await requireEstimatorOrManager();
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  try {
    return { ok: true, price: await priceOrder(input) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Couldn't price this roof" };
  }
}

// Place a BILLABLE measurement order. Gated: callers must collect an explicit,
// confirmed user action before invoking this. Records a pending report row.
export async function evOrderRoof(
  input: EvOrderInput,
): Promise<{ ok: true; reportId: number } | { ok: false; error: string }> {
  const { organizationId, user } = await requireEstimatorOrManager();
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  try {
    const { reportId } = await placeOrder(input);
    await db.eagleViewReport.upsert({
      where: { organizationId_reportId: { organizationId, reportId } },
      create: {
        organizationId,
        reportId,
        orderedById: user.id,
        status: "In Process",
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        productId: input.primaryProductId ?? null,
      },
      update: { status: "In Process" },
    });
    revalidatePath("/dashboard/advanced-ai/roof");
    return { ok: true, reportId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Couldn't place the order" };
  }
}

// Poll an order's status (for the post-order waiting UI).
export async function evReportStatus(
  reportId: number,
): Promise<
  | { ok: true; completed: boolean; status: string; displayStatus: string; totalCost: number | null }
  | { ok: false; error: string }
> {
  const { organizationId } = await requireEstimatorOrManager();
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  try {
    const s = await getReportSummary(reportId);
    await db.eagleViewReport.updateMany({
      where: { organizationId, reportId },
      data: { status: s.status, statusId: s.statusId, totalCost: s.totalCost },
    });
    return {
      ok: true,
      completed: s.completed,
      status: s.status,
      displayStatus: s.displayStatus,
      totalCost: s.totalCost,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Couldn't check status" };
  }
}
