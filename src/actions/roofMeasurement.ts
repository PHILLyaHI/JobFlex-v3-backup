"use server";

// Замер крыши — data-only (roofcore). Движок построения модели удалён:
// этот модуль ДОБЫВАЕТ и сохраняет данные — EagleView Instant (леджер
// покупок, идемпотентность, дозабор), Google Solar/DSM (бесплатно),
// регистрацию контура к растру, метрику покрытия, completeness по
// строениям, парсель-вето. modelJson остаётся полем схемы; новый код его
// НЕ пишет ("{}").
//
// THE FIRST CLICK GETS THE WHOLE ANSWER (review 2026-09-17). Every pack is
// ordered up front and collected together (lib/eagleviewOrder); whatever is
// still processing when the budget runs out is saved as `pending` and the
// page collects it without a new charge. Nothing pending is ever re-bought:
// a re-measure skips packs the address already has, complete or on the way.
// The whole action runs under one budget (ACTION_BUDGET_MS) below the page's
// maxDuration, and the elevation pass takes only what is left of it.

import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import {
  isEagleViewEnabled,
  instantCompleteAddress,
  pollInstantResult,
  submitInstantOrder,
  fetchPropertyImage,
  mergeInstantResults,
  PD_DIAGRAM_PACKS,
  eagleViewIdentity,
  instantAddressKey,
  PD_PACK,
  type EvOrderInput,
  type InstantRoofData,
  type PdPack,
} from "@/lib/eagleview";
import { satellitePhotoPng } from "@/lib/staticMapPhoto";
import {
  collectPlacedOrders,
  hasRoof,
  ORDER_COLLECT_BUDGET_MS,
  orderPacksFor,
  packReport,
  packsFromContent,
  rowPacks,
  type OrderDeps,
  type PackReport,
  type PlacedOrder,
} from "@/lib/eagleviewOrder";
import { markPacks, readEntitlements } from "@/lib/eagleviewEntitlements";
import { isSolarEnabled, SOLAR_CALL_BUDGET_MS, SolarUnavailableError, type SolarFailureKind } from "@/lib/solar";
import { buildReconModel, ReconUnavailableError, type ReconBuild } from "@/lib/roofReconBuild";
import { latLngRingToFrame } from "@/lib/roofRecon/surveyDsm";
import { registerContourToRaster, type Rigid2D } from "@/lib/roofRecon/register";
import { measureCoverage } from "@/lib/roofRecon/coverage";
import { measurePitch } from "@/lib/roofRecon/measuredPitch";
import { checkCompleteness } from "@/lib/roofRecon/completeness";
import { lotMaskFromPair, ringWhollyOutsideLot, type LotMask } from "@/lib/roofDiagram/parcelMask";
import { areaOf, type FootprintPoint } from "@/lib/roofRecon/footprint";
import { foreignIndices, pickMainStructure, rowFigures } from "@/lib/roofDiagram/instantTotals";
import { toDTO, toSummary, type StoredProvenance } from "@/lib/roofDiagram/dto";
import type { MeasurementProvenance, MeasurementSource, RoofMeasurementDTO, RoofMeasurementSummary } from "@/lib/roofDiagram/types";

type MeasureResult =
  | {
      ok: true;
      measurement: RoofMeasurementDTO;
      unsaved?: boolean;
      reusedInstant?: { requestId: string; how: "stored" | "recovered" };
      /** EagleView identity + the packs bought — for the browser console (EV_DEBUG). */
      debug?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      /**
       * The aerial provider answered with no roof at this address. The paid
       * answer is kept so a plain click never re-bills; only an explicit
       * re-measure orders again.
       */
      noRoof?: boolean;
      /** A paid order is still processing — the next click collects it for free. */
      stillProcessing?: boolean;
      debug?: Record<string, unknown>;
    };

interface LatLng {
  lat: number;
  lng: number;
}

const SOLAR_CALL_SLOTS = 2;
const RECON_DEADLINE_MS = SOLAR_CALL_SLOTS * SOLAR_CALL_BUDGET_MS;
/**
 * The whole measure action, start to save, stays under this — below the roof
 * page's maxDuration (300 s) with room for the response. The Instant phase
 * takes what it needs (placing up to seven orders, then one collect budget);
 * the elevation pass gets what is left, never less than a floor worth
 * starting; below that it is skipped and the page's free retry runs it.
 */
const ACTION_BUDGET_MS = 250_000;
const RECON_FLOOR_MS = 20_000;
/** How long a plain click waits for orders an earlier click left processing. */
const PENDING_COLLECT_BUDGET_MS = 45_000;
/** How long the page's background collect asks about pending orders per call. */
const BACKGROUND_COLLECT_BUDGET_MS = 12_000;
/** The elevation pass re-run when a late pack changes the roof's outline or pitch. */
const LATE_RECON_DEADLINE_MS = 40_000;

// ── helpers (module-private: a "use server" file may only export async fns) ──

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/**
 * Reject `p` if it has not settled within `ms`. The underlying work is not
 * cancelled (there is no handle to cancel a plane fit); its result is simply
 * discarded, which is what the fallbacks want.
 */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * The ortho we hand to the vision model. Unmasked first — EagleView blurs the
 * neighbours on a masked ortho and the blur edge reads as a roof edge to a
 * vision model; any ortho with a bbox is the fallback, since without a bbox a
 * box cannot be placed in the frame at all.
 */

function reconFailureKind(err: unknown): SolarFailureKind {
  if (err instanceof SolarUnavailableError || err instanceof ReconUnavailableError) return err.kind;
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "TimeoutError" || name === "AbortError" || /abort|timed out|timeout/i.test(msg)) return "timeout";
  return "error";
}


/** A terminal Property Data verdict (failed/rejected), as opposed to "not ready yet". */
const isTerminalPdFailure = (err: unknown): boolean =>
  err instanceof Error && /^Property Data request (?!failed \()/i.test(err.message) && /fail|error|reject/i.test(err.message);

interface ObtainedInstant {
  instant: InstantRoofData;
  /** Absent when this call ordered (and paid for) a fresh lookup. */
  reuse?: { requestId: string; how: "stored" | "recovered" };
  /** Which packs the answer is made of — see MeasurementProvenance.instantPacks. */
  packs: PackReport;
}

/** The I/O the pack-by-pack planner needs, bound to this org's ledger. */
function orderDeps(organizationId: string, addressKey: string, input: EvOrderInput): OrderDeps {
  return {
    submit: (inp, packs) => submitInstantOrder(inp, packs),
    poll: (requestId, inp, completeAddress, onRaw, maxWaitMs) => pollInstantResult(requestId, inp, completeAddress, maxWaitMs, { onRaw }),
    ledger: {
      create: async (requestId, packs) => {
        console.info("[roofMeasurement] instant order placed", { requestId, packs, org: organizationId });
        await db.instantOrder.create({
          data: { organizationId, addressKey, address: input.address ?? null, requestId, packs: JSON.stringify(packs) },
        });
      },
      complete: async (requestId, instant, raw) => {
        await db.instantOrder.update({
          where: { requestId },
          data: { status: "complete", instantJson: JSON.stringify(instant), ...(raw ? { instantRawJson: raw } : {}) },
        });
      },
      fail: async (requestId, error) => {
        await db.instantOrder.update({ where: { requestId }, data: { status: "failed", error } });
      },
    },
    entitlements: { read: readEntitlements, mark: markPacks },
    isTerminalFailure: isTerminalPdFailure,
    log: (msg) => console.error("[roofMeasurement] " + msg),
  };
}

/** Every complete order for the address, oldest first, the pack-001 order first of all. */
async function completeOrdersFor(organizationId: string, addressKey: string): Promise<{ parts: InstantRoofData[]; have: string[]; requestId: string | null }> {
  const rows = await db.instantOrder.findMany({
    where: { organizationId, addressKey, status: "complete", instantJson: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const parsed: Array<{ instant: InstantRoofData; packs: string[] }> = [];
  for (const row of rows) {
    try {
      parsed.push({ instant: JSON.parse(row.instantJson as string) as InstantRoofData, packs: rowPacks(row.packs) });
    } catch {
      /* an unreadable stored answer is skipped */
    }
  }
  parsed.sort((a, b) => Number(b.packs.includes(PD_PACK.ROOF_AREA)) - Number(a.packs.includes(PD_PACK.ROOF_AREA)));
  const have = [...new Set(parsed.flatMap((p) => p.packs))];
  return { parts: parsed.map((p) => p.instant), have, requestId: parsed[0]?.instant.requestId ?? null };
}

/** Orders for the address that were placed but not collected yet, oldest first. */
async function pendingOrdersFor(organizationId: string, addressKey: string, input: EvOrderInput): Promise<PlacedOrder[]> {
  const rows = await db.instantOrder.findMany({ where: { organizationId, addressKey, status: "pending" }, orderBy: { createdAt: "asc" } });
  const completeAddress = instantCompleteAddress(input);
  return rows.map((r) => ({ requestId: r.requestId, packs: rowPacks(r.packs) as PdPack[], completeAddress }));
}

/** What the account is currently refused, for the report of a reused answer. */
async function deniedNow(): Promise<string[]> {
  try {
    return [...(await readEntitlements()).values()].filter((r) => r.status === "denied").map((r) => r.pack);
  } catch {
    return [];
  }
}

/** The answer's parts with the roof-area part first — the merge's base. */
const areaFirst = (parts: InstantRoofData[]): InstantRoofData[] =>
  [...parts].sort((a, b) => Number(b.structures.some((s) => s.areaSqft != null)) - Number(a.structures.some((s) => s.areaSqft != null)));

/** The aerial provider answered, and the answer holds no roof. Kept, never re-billed by a plain click. */
class NoRoofError extends Error {
  constructor(requestId: string | null) {
    super(
      `The aerial provider found no roof at this address${requestId ? ` (order ${requestId})` : ""}. Check the address and the pin; a new lookup can be ordered from the report.`,
    );
    this.name = "NoRoofError";
  }
}

/** A paid order for the roof area is still processing — nothing to build on yet, and never a second order over it. */
class StillProcessingError extends Error {
  constructor(requestId: string) {
    super(`The aerial provider is still working on this address (order ${requestId}). Measure again in a minute — the paid order is collected then without a new charge.`);
    this.name = "StillProcessingError";
  }
}

/**
 * The only place the product path gets Instant data, and the reason each click
 * is no longer a new bill:
 *
 *   1. Orders an earlier click left PROCESSING are collected first — all of
 *      them, together, under one budget — and never re-ordered over. This is
 *      the recovery half: a first click whose orders outran the wait leaves
 *      the paid results in the ledger, and the next click picks them up.
 *   2. An already-paid answer for the same address — every complete
 *      InstantOrder row for it, merged (one address is several pack orders
 *      since 2026-09-08), or the latest saved measurement's instantJson — is
 *      reused as is. Nothing is bought on this path, not even packs the
 *      address lacks: buying is a deliberate act (re-measure), and the page
 *      says which packs are missing and offers it.
 *   3. Only then is anything ordered — every pack placed up front and
 *      collected together through lib/eagleviewOrder, each accepted request
 *      written to the ledger BEFORE its first poll, because from the moment
 *      EagleView accepts an order it is billable whether or not we wait.
 *      Losing the id to a timeout exception is how two paid Snohomish lookups
 *      became unrecoverable on 2026-08-26.
 *
 * `forceNewOrder` is the explicit "re-measure at a new cost": it buys the
 * packs the address does not have yet (nothing already bought or still
 * processing is bought twice), and only when the address already has every
 * pack does it place a fresh full order.
 */
async function obtainInstant(input: EvOrderInput, organizationId: string, forceNewOrder: boolean, deadlineAt: number): Promise<ObtainedInstant> {
  const addressKey = instantAddressKey(input);
  const keyed = addressKey !== "|||";
  const deps = orderDeps(organizationId, addressKey, input);
  const owned = keyed ? await completeOrdersFor(organizationId, addressKey) : { parts: [], have: [], requestId: null };

  // 1. what an earlier click left processing
  let recovered: Array<{ instant: InstantRoofData; packs: PdPack[]; requestId: string }> = [];
  let stillPending: string[] = [];
  let pendingAreaOrder: string | null = null;
  if (keyed) {
    const open = await pendingOrdersFor(organizationId, addressKey, input);
    if (open.length) {
      const budget = Math.min(PENDING_COLLECT_BUDGET_MS, Math.max(0, deadlineAt - Date.now() - RECON_FLOOR_MS));
      const c = await collectPlacedOrders(open, input, deps, budget);
      recovered = c.landed.map((l) => ({ instant: l.instant, packs: l.order.packs, requestId: l.order.requestId }));
      stillPending = c.pending.flatMap((o) => o.packs);
      pendingAreaOrder = c.pending.find((o) => o.packs.includes(PD_PACK.ROOF_AREA))?.requestId ?? null;
    }
  }
  const have = [...new Set([...owned.have, ...recovered.flatMap((r) => r.packs)])];
  const parts = areaFirst([...owned.parts, ...recovered.map((r) => r.instant)]);
  // The area itself is still on the way: nothing to build on, and no second order over it, re-measure or not.
  if (!have.includes(PD_PACK.ROOF_AREA) && pendingAreaOrder) throw new StillProcessingError(pendingAreaOrder);

  if (keyed && !forceNewOrder) {
    // 2a. complete orders in the ledger (and what was just collected), merged
    if (parts.length && have.includes(PD_PACK.ROOF_AREA)) {
      const instant = mergeInstantResults(parts);
      if (!hasRoof(instant)) throw new NoRoofError(instant.requestId);
      const first = recovered.find((r) => r.packs.includes(PD_PACK.ROOF_AREA)) ?? recovered[0];
      return {
        instant,
        reuse: { requestId: first?.requestId ?? owned.requestId ?? instant.requestId, how: recovered.length ? "recovered" : "stored" },
        packs: packReport(have, await deniedNow(), [], [], stillPending),
      };
    }
    // 2b. an answer already saved on a measurement row (rows predate the ledger)
    if (!parts.length) {
      const prior = await db.roofMeasurement.findMany({
        where: { organizationId, instantJson: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { instantJson: true, instantRequestId: true, address: true, city: true, state: true, zip: true },
      });
      for (const row of prior) {
        if (instantAddressKey({ address: row.address ?? "", city: row.city ?? "", state: row.state ?? "", zip: row.zip ?? "" }) !== addressKey) continue;
        try {
          const parsed = JSON.parse(row.instantJson as string) as InstantRoofData;
          if (parsed.structures?.some((st) => (st.outline?.length ?? 0) >= 3)) {
            // A pre-ledger row records what the answer CONTAINS, not what was
            // asked for: the packs are read off the fields, the rest is unknown
            // — never "all seven" by assumption (audit 2026-09-09).
            const evident = packsFromContent(parsed);
            return {
              instant: parsed,
              reuse: { requestId: row.instantRequestId ?? parsed.requestId, how: "stored" },
              packs: packReport(evident.have, [], [], evident.unknown),
            };
          }
        } catch {
          /* skip unreadable rows */
        }
      }
    }
  }

  // 3. buy — every pack the address lacks, placed up front and collected
  // together. A re-measure on an address that has every pack is the one case
  // that orders everything again.
  const hasAll = PD_DIAGRAM_PACKS.every((p) => have.includes(p));
  const skip = forceNewOrder && hasAll ? [] : [...have, ...stillPending];
  const base = skip.length && parts.length ? mergeInstantResults(parts) : null;
  // Placing up to seven orders takes a few seconds each at worst; the collect
  // wait takes what is left, and the elevation pass after it keeps its floor.
  const collectBudgetMs = Math.max(15_000, Math.min(ORDER_COLLECT_BUDGET_MS, deadlineAt - Date.now() - RECON_FLOOR_MS - 30_000));
  const { instant, report } = await orderPacksFor(input, deps, { skip, base, collectBudgetMs });
  if (!hasRoof(instant)) throw new NoRoofError(instant.requestId);
  const pendingNow = [...new Set([...(report.pending ?? []), ...stillPending.filter((p) => !report.have.includes(p))])];
  return { instant, packs: packReport(report.have, report.denied, report.failed, report.unknown ?? [], pendingNow) };
}

/** Everything the witnesses established about an answer — what persistData saves. */
interface Witnessed {
  provenance: MeasurementProvenance;
  origin: LatLng | null;
}

/** A frame-feet ring moved by the registration's rigid transform (register.ts forward). */
function applyRigid(ring: FootprintPoint[], t: Rigid2D): FootprintPoint[] {
  const c = Math.cos((t.thetaDeg * Math.PI) / 180);
  const s = Math.sin((t.thetaDeg * Math.PI) / 180);
  return ring.map((p) => ({ ...p, x: p.x * c - p.y * s + t.dxFt, y: p.x * s + p.y * c + t.dyFt }));
}

/**
 * The WITNESSES: everything the free data says about the paid answer —
 * parcel veto, the main structure, the elevation pass (registration,
 * coverage, measured pitch), completeness. One function for both the
 * measure and the late-pack collect, so a pack that lands after the row was
 * saved (the outline, the pitch) gets the same treatment as one that landed
 * on the first click (review 2026-09-17: before this, a late outline never
 * got a coverage figure or a measured pitch).
 *
 * `reconDeadlineMs` ≤ 0 skips the elevation pass and says so on the row; the
 * page's free retry runs it then.
 */
async function witnessInstant(p: {
  instant: InstantRoofData;
  input: EvOrderInput;
  packs: PackReport;
  refreshSolar: boolean;
  reconDeadlineMs: number;
}): Promise<Witnessed> {
  const { instant, input, packs } = p;
  const origin: LatLng | null = instant.lat != null && instant.lng != null ? { lat: instant.lat, lng: instant.lng } : null;
  const contours = instant.structures.map((st) => st.outline ?? []).filter((r) => r.length >= 3);

  const provenance: MeasurementProvenance = {};

  // парсель-вето: строения целиком вне лота — BEFORE the main structure is
  // chosen, because the choice excludes vetoed structures.
  const lot = await lotMaskFor(instant, origin);
  if (lot && origin) {
    const foreign: string[] = [];
    instant.structures.forEach((st, i) => {
      const ring = st.outline ?? [];
      if (ring.length >= 3 && ringWhollyOutsideLot(lot, ring)) foreign.push("s" + i);
    });
    if (foreign.length) (provenance as Record<string, unknown>).parcelVeto = { foreignStructures: foreign };
  }

  // THE MAIN STRUCTURE (audit 2026-09-08). EagleView answers with every
  // structure on the parcel (12117: the house and nineteen outbuildings);
  // the row's figures, the hero, the estimate — and every witness below:
  // registration, coverage, measured pitch, completeness — are about ONE of
  // them. The rest are listed on the page with checkboxes.
  const veto = (provenance as Record<string, unknown>).parcelVeto as { foreignStructures?: string[] } | undefined;
  const pick = pickMainStructure(instant.structures, {
    foreign: foreignIndices(veto?.foreignStructures),
    origin,
    parcelKnown: lot != null,
  });
  const mainSt = pick.index != null ? instant.structures[pick.index] : null;
  if (pick.index != null) {
    const others = instant.structures.filter((_, i) => i !== pick.index);
    provenance.mainStructure = {
      index: pick.index,
      how: pick.how,
      others: others.length,
      othersSqft: Math.round(others.reduce((a, s) => a + (s.areaSqft ?? 0), 0)),
    };
  }
  const mainOutline = mainSt?.outline && mainSt.outline.length >= 3 ? mainSt.outline : contours[0] ?? null;

  // DSM/Solar (бесплатно): покрытие и регистрация; отказ не валит замер
  let recon: ReconBuild | null = null;
  if (!isSolarEnabled()) {
    provenance.reconUnavailable = { kind: "unreachable" as SolarFailureKind, message: "Google Solar is not configured" };
  } else if (p.reconDeadlineMs < RECON_FLOOR_MS) {
    provenance.reconUnavailable = {
      kind: "timeout",
      message: "The aerial order used the time this measurement had; the elevation check was not started. Measure again (free) to add it.",
    };
  } else {
    try {
      recon = await withDeadline(
        buildReconModel({
          ...input,
          ...(p.refreshSolar ? { refreshSolar: true } : {}),
          ...(contours.length ? { contours } : {}),
        }),
        Math.min(RECON_DEADLINE_MS, p.reconDeadlineMs),
        "Roof reconstruction data",
      );
    } catch (err) {
      provenance.reconUnavailable = { kind: reconFailureKind(err), message: errorMessage(err, String(err)) };
    }
  }

  if (recon) {
    provenance.imageryQuality = recon.layers.imageryQuality;
    // Solar hands the capture date as {year, month, day} — stringify it as an
    // ISO day, not String(object) (which stored "[object Object]").
    const d = recon.layers.imageryDate;
    provenance.imageryDate = d?.year
      ? `${d.year}-${String(d.month ?? 0).padStart(2, "0")}-${String(d.day ?? 0).padStart(2, "0")}`
      : undefined;
    provenance.pixelSizeM = recon.dsm.pixelSizeM;
    provenance.googleAreaSqft = recon.googleAreaSqft ?? null;
    // The raster's frame has its origin at the pin the tile was fetched
    // around (recon.origin) — the Places pin, or the cached tile's — not at
    // EagleView's own lat/lng. Rings are converted into THAT frame; the
    // registration then says how far the outline sits from the roof the
    // raster shows, and coverage is measured on the registered outline
    // (review 2026-09-17: before this, rings converted from the other pin
    // were measured unregistered, and a few metres of offset read as roof
    // the elevation data "did not see").
    const ring0: FootprintPoint[] | null = mainOutline ? (latLngRingToFrame(recon.origin, mainOutline).ring as FootprintPoint[]) : null;
    let mainContours: FootprintPoint[][] = ring0 ? [ring0] : contours.map((r) => latLngRingToFrame(recon!.origin, r).ring as FootprintPoint[]);
    let regT: Rigid2D | null = null;
    if (ring0) {
      try {
        const reg = registerContourToRaster({
          contour: ring0,
          mask: recon.mask as never,
          dsm: recon.dsm as never,
          groundElevFt: recon.diagnostics.groundElevFt,
        });
        if (reg.applied) {
          regT = reg.transform;
          provenance.registration = {
            dxFt: reg.transform.dxFt,
            dyFt: reg.transform.dyFt,
            thetaDeg: reg.transform.thetaDeg,
          } as unknown as MeasurementProvenance["registration"];
        }
      } catch {
        /* регистрация — свидетель, не условие */
      }
    }
    if (regT) mainContours = mainContours.map((r) => applyRigid(r, regT!));
    const cov = measureCoverage({
      mask: recon.mask as never,
      dsm: recon.dsm as never,
      groundElevFt: recon.diagnostics.groundElevFt,
      rings: mainContours,
    });
    if (cov) provenance.coverage = { seenSqft: cov.seenSqft, contourSqft: cov.contourSqft, share: cov.share, insetShare: cov.insetShare };

    // ── measured pitch — the retired line's proven DSM measurement (cells →
    // plane court → consistency), data-only. The report is stored whole; the
    // page decides how to word it. pitchSource mirrors the verdict in the
    // shape confidence.ts already reads. measurePitch applies the transform
    // itself, so it takes the unregistered rings.
    try {
      const pitchLabel = mainSt?.pitch ?? instant.totals.pitchLabel;
      const instantPitch12 = pitchLabel ? Number(pitchLabel.split("/")[0]) : null;
      const solarPanels = mainSt ? mainSt.solarPanels === true : instant.structures.some((st) => st.solarPanels === true);
      const pitchRep = measurePitch({
        dsm: recon.dsm as never,
        contours: ring0 ? [ring0] : contours.map((r) => latLngRingToFrame(recon!.origin, r).ring as FootprintPoint[]),
        transform: regT,
        instantPitch12,
        solarPanels,
        coverageShare: cov?.share ?? null,
      });
      (provenance as Record<string, unknown>).pitchMeasurement = {
        ...pitchRep,
        instantPitch12,
        // Known case (12629/12621 published 6/12, measured ≈7.1): a gap over
        // 1/12 between the measured dominant and the published figure is worth
        // a line in the source status.
        disagrees:
          pitchRep.source === "measured" &&
          instantPitch12 != null &&
          Math.abs(pitchRep.families[0].pitch12 - instantPitch12) > 1,
      };
      provenance.pitchSource = {
        source: pitchRep.source,
        reason: pitchRep.reason,
        trustedShare: pitchRep.trustedShare,
        instantPitch12,
        ...(solarPanels ? { solarPanels } : {}),
      } as unknown as MeasurementProvenance["pitchSource"];
    } catch (err) {
      console.warn("[roofMeasurement] pitch measurement failed:", errorMessage(err, String(err)));
    }
  }

  // completeness по строениям (контуры против Instant)
  //
  // Without pack 007 no structure has a ring; that is "outline not
  // purchased", a warn, never the LOW CONFIDENCE "building missing" verdict
  // that would disable pricing on figures that are complete.
  const frameOrigin = recon?.origin ?? origin;
  const mainFrame = frameOrigin && mainOutline ? (latLngRingToFrame(frameOrigin, mainOutline).ring as FootprintPoint[]) : null;
  const planAreaSqft = mainFrame ? Math.abs(areaOf(mainFrame)) : 0;
  const completeness = checkCompleteness({
    mainIndex: pick.index,
    planAreaSqft,
    structures: instant.structures.map((st, i) => {
      const fr = frameOrigin && st.outline && st.outline.length >= 3 ? (latLngRingToFrame(frameOrigin, st.outline).ring as FootprintPoint[]) : null;
      return {
        prefix: "s" + i,
        ring: fr,
        contourAreaSqft: fr ? Math.abs(areaOf(fr)) : 0,
      };
    }),
    instant,
    // No outline is not a lost building when the outline pack was never
    // bought — or is still on its way: refused, not attempted or pending →
    // a note, not an error.
    outlinesNotPurchased: !packs.have.includes(PD_PACK.OUTLINES),
  });
  provenance.completeness = {
    findings: completeness.findings,
    planSqft: completeness.planSqft,
    instantSqft: (completeness as unknown as { instantSqft?: number | null }).instantSqft ?? null,
  } as unknown as MeasurementProvenance["completeness"];
  provenance.instantPacks = packs;

  return { provenance, origin };
}

/**
 * Collect the packs EagleView had not finished when the measurement was
 * saved. Since 2026-09-17 the first click places every order up front and
 * waits for all of them together, so this is the exception, not the rule:
 * an order slower than the collect budget is saved as `pending` on the row
 * and the page calls this every few seconds for about two minutes. Each
 * pending order is asked about briefly; what has landed is merged into the
 * saved row (columns, packs report and all) and, when a pack the witnesses
 * read landed (the outline, the pitch, the details), the elevation pass is
 * re-run so the row gets its coverage and measured pitch the way a first-
 * click answer does. Nothing is ordered.
 */
export async function collectPendingInstant(measurementId: string): Promise<
  | { ok: true; pending: number; updated: false }
  | { ok: true; pending: number; updated: true; measurement: RoofMeasurementDTO }
  | { ok: false; error: string }
> {
  let organizationId: string;
  try {
    organizationId = (await requireEstimatorOrManager()).organizationId;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Not authorised") };
  }
  const row = await db.roofMeasurement.findFirst({ where: { id: measurementId, organizationId } });
  if (!row) return { ok: false, error: "Measurement not found" };
  const input: EvOrderInput = {
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? "",
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
  };
  const addressKey = instantAddressKey(input);
  if (addressKey === "|||") return { ok: true, pending: 0, updated: false };
  const open = await pendingOrdersFor(organizationId, addressKey, input);
  if (!open.length) return { ok: true, pending: 0, updated: false };

  const deps = orderDeps(organizationId, addressKey, input);
  const c = await collectPlacedOrders(open, input, deps, BACKGROUND_COLLECT_BUDGET_MS);
  const stillPending = c.pending.flatMap((o) => o.packs);
  if (!c.landed.length && !c.failed.length) return { ok: true, pending: c.pending.length, updated: false };

  // Merge what landed into the saved answer — the stored answer is the base,
  // every null field takes the first later part's value (mergeInstantResults).
  let stored: InstantRoofData | null = null;
  try {
    stored = row.instantJson ? (JSON.parse(row.instantJson) as InstantRoofData) : null;
  } catch {
    stored = null;
  }
  const landed = c.landed.map((l) => l.instant);
  const merged = landed.length ? mergeInstantResults(stored ? [stored, ...landed] : areaFirst(landed)) : stored;
  if (!merged) return { ok: true, pending: c.pending.length, updated: false };

  let storedProv: StoredProvenance = { calibration: null, provenance: {} as MeasurementProvenance };
  try {
    const parsed = row.provenanceJson ? (JSON.parse(row.provenanceJson) as Partial<StoredProvenance>) : null;
    if (parsed && typeof parsed === "object") storedProv = { calibration: parsed.calibration ?? null, provenance: (parsed.provenance ?? {}) as MeasurementProvenance };
  } catch {
    /* unreadable provenance — rebuilt below with what is known */
  }
  const owned = await completeOrdersFor(organizationId, addressKey);
  const prior = storedProv.provenance.instantPacks;
  const packs = packReport(owned.have, await deniedNow(), [...(prior?.failed ?? []), ...c.failed.flatMap((o) => o.packs)], prior?.unknown ?? [], stillPending);

  // A late outline, pitch or details pack changes what the witnesses see:
  // re-run them, keeping what only the first click knew (the reuse note).
  const landedPacks = new Set(c.landed.flatMap((l) => l.order.packs));
  const witnessed = [PD_PACK.OUTLINES, PD_PACK.PITCH_EAVE, PD_PACK.PROPERTY_DETAILS, PD_PACK.ORTHO].some((p) => landedPacks.has(p));
  let provenance = storedProv.provenance;
  let origin: LatLng | null = row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
  if (witnessed) {
    try {
      const w = await witnessInstant({ instant: merged, input, packs, refreshSolar: false, reconDeadlineMs: LATE_RECON_DEADLINE_MS });
      provenance = { ...w.provenance, ...(storedProv.provenance.instantReuse ? { instantReuse: storedProv.provenance.instantReuse } : {}) };
      origin = w.origin ?? origin;
    } catch (err) {
      console.warn("[roofMeasurement] late witnesses failed, keeping the saved ones:", errorMessage(err, String(err)));
      provenance = { ...storedProv.provenance, instantPacks: packs };
    }
  } else {
    provenance = { ...storedProv.provenance, instantPacks: packs };
  }
  storedProv = { calibration: storedProv.calibration, provenance };

  const fig = rowFigures({
    instant: merged,
    provenance: provenance as unknown as Record<string, unknown>,
    columns: { areaSqft: row.areaSqft, squares: row.squares, lat: row.lat, lng: row.lng },
  });
  const updated = await db.roofMeasurement.update({
    where: { id: row.id },
    data: {
      areaSqft: fig.areaSqft,
      squares: fig.squares,
      predominantPitch: fig.predominantPitch,
      facetCount: fig.facetCount,
      lat: row.lat ?? origin?.lat ?? merged.lat ?? null,
      lng: row.lng ?? origin?.lng ?? merged.lng ?? null,
      instantJson: JSON.stringify(merged),
      provenanceJson: JSON.stringify(storedProv),
    },
  });
  return { ok: true, pending: c.pending.length, updated: true, measurement: toDTO(updated) };
}

// ── actions ──────────────────────────────────────────────────────────────────

/**
 * Instant measure: one billed EagleView Instant lookup + the free reconstruction,
 * run together, calibrated, chimney-scanned and saved.
 */

async function lotMaskFor(instant: InstantRoofData, origin: LatLng | null): Promise<LotMask | null> {
  if (!origin) return null;
  const groups = new Map<string, typeof instant.imagery>();
  for (const im of instant.imagery) {
    if (im.view !== "ortho" || !im.bbox || typeof im.masked !== "boolean") continue;
    const [a, b, c, d] = im.bbox;
    if (!(origin.lng >= a && origin.lng <= c && origin.lat >= b && origin.lat <= d)) continue;
    const k = im.bbox.join(",");
    groups.set(k, [...(groups.get(k) ?? []), im]);
  }
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  const pair = [...groups.values()]
    .filter((g) => g.some((i) => i.masked) && g.some((i) => !i.masked))
    .sort((x, y) => area(y[0].bbox!) - area(x[0].bbox!))[0];
  if (!pair) return null;
  try {
    const fetched = await withDeadline(
      Promise.all([
        fetchPropertyImage(pair.find((i) => !i.masked)!.token),
        fetchPropertyImage(pair.find((i) => i.masked)!.token),
      ]),
      8_000,
      "Parcel mask imagery",
    );
    return lotMaskFromPair(new Uint8Array(fetched[0].bytes), new Uint8Array(fetched[1].bytes), pair[0].bbox!);
  } catch (err) {
    console.warn("[roofMeasurement] parcel mask unavailable:", errorMessage(err, String(err)));
    return null;
  }
}

async function persistData(p: {
  organizationId: string;
  createdById: string;
  source: MeasurementSource;
  input: EvOrderInput;
  origin: LatLng | null;
  instant: InstantRoofData | null;
  provenance: MeasurementProvenance;
}): Promise<RoofMeasurementDTO> {
  // The row's figures are the MAIN structure's, and the pitch column is the
  // pitch the page shows (measured families when there are any), so the
  // Recent list and the hero cannot disagree (audit 2026-09-08).
  const fig = rowFigures({
    instant: p.instant,
    provenance: p.provenance as Record<string, unknown>,
    columns: { areaSqft: null, squares: null, lat: p.origin?.lat ?? null, lng: p.origin?.lng ?? null },
  });
  const stored: StoredProvenance = { calibration: null, provenance: p.provenance };
  const row = await db.roofMeasurement.create({
    data: {
      organizationId: p.organizationId,
      createdById: p.createdById,
      source: p.source,
      address: p.input.address ?? p.instant?.address ?? null,
      city: p.input.city ?? null,
      state: p.input.state ?? null,
      zip: p.input.zip ?? null,
      lat: p.origin?.lat ?? p.instant?.lat ?? null,
      lng: p.origin?.lng ?? p.instant?.lng ?? null,
      areaSqft: fig.areaSqft,
      squares: fig.squares,
      predominantPitch: fig.predominantPitch,
      facetCount: fig.facetCount,
      instantRequestId: p.instant?.requestId ?? null,
      instantJson: p.instant ? JSON.stringify(p.instant) : null,
      // движок удалён: геометрия не пишется, поле схемы не тронуто
      modelJson: "{}",
      chimneyJson: "[]",
      provenanceJson: JSON.stringify(stored),
    },
  });
  return toDTO(row);
}

/**
 * What the contractor reads when the aerial order fails. The full message —
 * account, client id, host — stays in the console debug line; the toast
 * says what happened in one plain sentence (review 2026-09-17: the first
 * thing a contractor saw on a failed first measurement was a raw 401 body).
 */
function userFacingInstantError(err: unknown): string {
  if (err instanceof NoRoofError || err instanceof StillProcessingError) return err.message;
  const msg = errorMessage(err, "");
  if (/not entitled|entitlement|403/i.test(msg)) return "The aerial provider refused this order: the account is not entitled to the roof-area data. This is an account setting, not the address.";
  if (/credentials|invalid_client|401|sandbox app/i.test(msg)) return "The aerial provider rejected our credentials. This is a setup problem on our side, not the address.";
  if (/taking longer|still processing/i.test(msg)) return msg.replace(/\s*Account org.*$/s, "");
  if (/timed out|timeout|abort/i.test(msg)) return "The aerial provider did not answer in time. Nothing was lost — measure again in a minute; any order that was placed is collected without a new charge.";
  if (/no request id|nothing to measure/i.test(msg)) return "The aerial provider returned no roof data for this address.";
  return "The aerial provider could not answer for this address" + (msg ? ` (${msg.replace(/\s*Account org.*$/s, "").slice(0, 140)})` : "") + ".";
}

/**
 * Замер: добыть Instant (леджер/идемпотентность/дозабор), добыть
 * DSM/Solar (бесплатно), зарегистрировать контур к растру, померить
 * покрытие и completeness, применить парсель-вето — и сохранить ДАННЫЕ.
 * Чертёж не строится.
 */
export async function measureRoofInstant(
  input: EvOrderInput,
  opts?: { forceNewOrder?: boolean },
): Promise<MeasureResult> {
  let organizationId: string;
  let userId: string;
  try {
    const ctx = await requireEstimatorOrManager();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Not authorised") };
  }
  if (!isEagleViewEnabled()) return { ok: false, error: "Aerial data is not configured" };
  if (!input.address && input.lat == null) return { ok: false, error: "Pick an address first" };
  const deadlineAt = Date.now() + ACTION_BUDGET_MS;

  // Instant: через леджер заказов (переиспользование, дозабор, покупка)
  let instant: InstantRoofData;
  let reuse: { requestId: string; how: "stored" | "recovered" } | undefined;
  let packs: PackReport;
  try {
    const got = await obtainInstant(input, organizationId, opts?.forceNewOrder === true, deadlineAt);
    instant = got.instant;
    reuse = got.reuse;
    packs = got.packs;
  } catch (err) {
    const debug = { ...eagleViewIdentity(), stage: "instant order", error: errorMessage(err, String(err)) };
    console.warn("[roofMeasurement] instant failed", debug);
    return {
      ok: false,
      error: userFacingInstantError(err),
      ...(err instanceof NoRoofError ? { noRoof: true } : {}),
      ...(err instanceof StillProcessingError ? { stillProcessing: true } : {}),
      debug,
    };
  }
  const debug = { ...eagleViewIdentity(), packs, reused: reuse ?? null, requestId: instant.requestId };

  // The witnesses take what is left of the budget; the elevation pass is
  // skipped (and said so) when the order used it up.
  const { provenance, origin } = await witnessInstant({
    instant,
    input,
    packs,
    refreshSolar: opts?.forceNewOrder === true,
    reconDeadlineMs: deadlineAt - Date.now(),
  });
  if (reuse) provenance.instantReuse = reuse;

  try {
    const measurement = await persistData({
      organizationId,
      createdById: userId,
      source: "instant+recon",
      input,
      origin,
      instant,
      provenance,
    });
    return { ok: true, measurement, ...(reuse ? { reusedInstant: reuse } : {}), debug };
  } catch (err) {
    console.warn("[roofMeasurement] row not saved:", errorMessage(err, String(err)));
    return { ok: false, error: "Measured, but the row could not be saved", debug };
  }
}

/** Бесплатная реконструкция строила модель — движок удалён. */
export async function measureRoofFree(): Promise<MeasureResult> {
  return { ok: false, error: "Free reconstruction was removed with the drawing engine (roofcore): use Instant measure." };
}

export async function listRoofMeasurements(limit = 20): Promise<RoofMeasurementSummary[]> {
  const ctx = await requireEstimatorOrManager();
  const rows = await db.roofMeasurement.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(100, limit)),
    select: {
      id: true, source: true, address: true, city: true, state: true,
      areaSqft: true, squares: true, predominantPitch: true, facetCount: true,
      pngUrl: true, createdAt: true, lat: true, lng: true,
      instantJson: true, provenanceJson: true,
    },
  });
  // The list shows the same figures the page it opens shows — the one rule
  // in lib/roofDiagram/instantTotals.rowFigures, not the columns as saved by
  // whichever pipeline wrote them (audit 2026-09-09).
  return rows.map((row) => {
    let instant: InstantRoofData | null = null;
    let provenance: Record<string, unknown> | null = null;
    try { instant = row.instantJson ? (JSON.parse(row.instantJson) as InstantRoofData) : null; } catch { instant = null; }
    try { provenance = row.provenanceJson ? ((JSON.parse(row.provenanceJson) as { provenance?: Record<string, unknown> }).provenance ?? null) : null; } catch { provenance = null; }
    const fig = rowFigures({ instant, provenance, columns: { areaSqft: row.areaSqft, squares: row.squares, lat: row.lat, lng: row.lng } });
    return {
      ...toSummary(row),
      areaSqft: fig.areaSqft,
      squares: fig.squares,
      predominantPitch: fig.predominantPitch,
      facetCount: fig.facetCount,
      pitchKind: fig.pitchKind,
    };
  });
}

export async function getRoofMeasurement(id: string): Promise<RoofMeasurementDTO | null> {
  const ctx = await requireEstimatorOrManager();
  const row = await db.roofMeasurement.findFirst({ where: { id, organizationId: ctx.organizationId } });
  return row ? toDTO(row) : null;
}

/**
 * Google Maps satellite photo for the measurement — what the data view shows
 * in place of the drawing (owner's call 2026-09-02: the familiar Google Maps
 * look, clean, no outlines; EagleView ortho deliberately NOT used).
 *
 * Centre = the measurement's pin; zoom fitted to the Instant outlines' bbox
 * (the whole lot plus a little surroundings), default 20 for a house when
 * there is nothing to fit to. scale=2 for crispness. Cached on disk by
 * address+zoom (.cache/staticmap) so reopening the page costs no API call.
 */

/** One fixed zoom for every address — the standard Google Maps address view
 *  (owner's call: no per-lot fitting at all; the pin centres the house). */

export async function getMeasurementPhoto(
  id: string,
): Promise<{ ok: true; dataUrl: string; zoom: number } | { ok: false; error: string }> {
  const ctx = await requireEstimatorOrManager();
  const row = await db.roofMeasurement.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { address: true, city: true, state: true, zip: true, lat: true, lng: true, instantJson: true },
  });
  if (!row) return { ok: false, error: "Measurement not found" };
  // The fetch + disk cache live in lib/staticMapPhoto, shared with the
  // client's public proposal page (its site-photo route).
  const photo = await satellitePhotoPng(row);
  if (!photo.ok) return photo;
  return { ok: true, dataUrl: "data:image/png;base64," + photo.bytes.toString("base64"), zoom: photo.zoom };
}

/** Орто EagleView (данные, без чертежа) — the report's ORTHO tab, shown only
 *  when the paid answer carried imagery; the default view is the Google Maps
 *  photo (getMeasurementPhoto above). */
export async function getMeasurementOrtho(id: string): Promise<
  | { ok: true; dataUrl: string; bbox: [number, number, number, number]; rings: Array<Array<{ lat: number; lng: number }>> }
  | { ok: false; error: string }
> {
  const ctx = await requireEstimatorOrManager();
  const row = await db.roofMeasurement.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { instantJson: true } });
  if (!row?.instantJson) return { ok: false, error: "No Instant data on this measurement" };
  let instant: InstantRoofData;
  try {
    instant = JSON.parse(row.instantJson) as InstantRoofData;
  } catch {
    return { ok: false, error: "Stored Instant data is unreadable" };
  }
  const wide = instant.imagery
    .filter((im) => im.view === "ortho" && im.bbox && im.masked === false)
    .sort((a, b) => (b.bbox![2] - b.bbox![0]) * (b.bbox![3] - b.bbox![1]) - (a.bbox![2] - a.bbox![0]) * (a.bbox![3] - a.bbox![1]))[0];
  if (!wide?.token || !wide.bbox) return { ok: false, error: "No ortho imagery on this measurement" };
  try {
    const img = await fetchPropertyImage(wide.token);
    const b64 = Buffer.from(img.bytes).toString("base64");
    const mime = img.contentType || "image/png";
    return {
      ok: true,
      dataUrl: "data:" + mime + ";base64," + b64,
      bbox: wide.bbox as [number, number, number, number],
      rings: instant.structures.map((st) => st.outline ?? []).filter((r) => r.length >= 3),
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Ortho image unavailable") };
  }
}
