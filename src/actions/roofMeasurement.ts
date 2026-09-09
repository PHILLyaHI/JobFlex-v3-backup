"use server";

// Замер крыши — data-only (roofcore). Движок построения модели удалён:
// этот модуль ДОБЫВАЕТ и сохраняет данные — EagleView Instant (леджер
// покупок, идемпотентность, дозабор), Google Solar/DSM (бесплатно),
// регистрацию контура к растру, метрику покрытия, completeness по
// строениям, Google-сегменты (чтение roofSegmentStats), парсель-вето.
// modelJson остаётся полем схемы; новый код его НЕ пишет ("{}").

import { promises as fs } from "node:fs";
import { join } from "node:path";
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
} from "@/lib/eagleview";
import { orderPacksFor, packReport, packsFromContent, rowPacks, type OrderDeps, type PackReport } from "@/lib/eagleviewOrder";
import { markPacks, readEntitlements } from "@/lib/eagleviewEntitlements";
import { isSolarEnabled, getBuildingInsights, SOLAR_CALL_BUDGET_MS, SolarUnavailableError, type SolarFailureKind } from "@/lib/solar";
import { buildReconModel, ReconUnavailableError, type ReconBuild } from "@/lib/roofReconBuild";
import { latLngRingToFrame } from "@/lib/roofRecon/surveyDsm";
import { registerContourToRaster } from "@/lib/roofRecon/register";
import { measureCoverage } from "@/lib/roofRecon/coverage";
import { measurePitch } from "@/lib/roofRecon/measuredPitch";
import { checkCompleteness } from "@/lib/roofRecon/completeness";
import { lotMaskFromPair, ringWhollyOutsideLot, type LotMask } from "@/lib/roofDiagram/parcelMask";
import type { ArbiterSegment } from "@/lib/roofRecon/googleArbiter";
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
  | { ok: false; error: string; debug?: Record<string, unknown> };

interface LatLng {
  lat: number;
  lng: number;
}

const SOLAR_CALL_SLOTS = 2;
const RECON_DEADLINE_MS = SOLAR_CALL_SLOTS * SOLAR_CALL_BUDGET_MS;
const EARTH_R_M = 6378137;
const FT_PER_M = 3.28084;
const D2R = Math.PI / 180;

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
    poll: (requestId, inp, completeAddress, onRaw) => pollInstantResult(requestId, inp, completeAddress, 30_000, { onRaw }),
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

/** What the account is currently refused, for the report of a reused answer. */
async function deniedNow(): Promise<string[]> {
  try {
    return [...(await readEntitlements()).values()].filter((r) => r.status === "denied").map((r) => r.pack);
  } catch {
    return [];
  }
}

/**
 * The only place the product path gets Instant data, and the reason each click
 * is no longer a new bill:
 *
 *   1. An already-paid answer for the same address — every complete
 *      InstantOrder row for it, merged (one address can be several pack
 *      orders since 2026-09-08), or the latest saved measurement's
 *      instantJson — is reused as is. Nothing is bought on this path, not
 *      even packs the address lacks: buying is a deliberate act (re-measure).
 *   2. A pending order for the address is COLLECTED (result/{id}) instead of
 *      re-ordered. This is the recovery half: a poll that timed out earlier
 *      left the row pending, and the paid result is picked up here for free.
 *   3. Only then is anything ordered — pack by pack through lib/eagleviewOrder,
 *      each accepted request written to the ledger BEFORE its first poll,
 *      because from the moment EagleView accepts an order it is billable
 *      whether or not we wait. Losing the id to a timeout exception is how
 *      two paid Snohomish lookups became unrecoverable on 2026-08-26.
 *
 * `forceNewOrder` is the explicit "re-measure at a new cost": it buys the
 * packs the address does not have yet (nothing already bought is bought
 * twice), and only when the address already has every pack does it place a
 * fresh full order.
 */
async function obtainInstant(input: EvOrderInput, organizationId: string, forceNewOrder: boolean): Promise<ObtainedInstant> {
  const addressKey = instantAddressKey(input);
  const keyed = addressKey !== "|||";
  const owned = keyed ? await completeOrdersFor(organizationId, addressKey) : { parts: [], have: [], requestId: null };

  if (keyed && !forceNewOrder) {
    // 1a. complete orders in the ledger, merged
    if (owned.parts.length && owned.requestId) {
      return {
        instant: mergeInstantResults(owned.parts),
        reuse: { requestId: owned.requestId, how: "stored" },
        packs: packReport(owned.have, await deniedNow(), []),
      };
    }
    // 1b. an answer already saved on a measurement row (rows predate the ledger)
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
    // 2. a pending order — collect it, never re-order over it
    const pending = await db.instantOrder.findFirst({
      where: { organizationId, addressKey, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      try {
        // Keep the body EagleView actually sent, not only what we parse out of
        // it — see InstantOrder.instantRawJson.
        let rawBody: string | null = null;
        const got = await pollInstantResult(pending.requestId, input, instantCompleteAddress(input), 30_000, {
          onRaw: (body) => { rawBody = body; },
        });
        if (got) {
          await db.instantOrder
            .update({
              where: { id: pending.id },
              data: { status: "complete", instantJson: JSON.stringify(got), ...(rawBody ? { instantRawJson: rawBody } : {}) },
            })
            .catch(() => {});
          return {
            instant: got,
            reuse: { requestId: pending.requestId, how: "recovered" },
            packs: packReport(rowPacks(pending.packs), await deniedNow(), []),
          };
        }
        throw new Error(
          `A Property Data order for this address is already processing (order ${pending.requestId}) — measuring again later will collect it without paying twice.`,
        );
      } catch (err) {
        if (!isTerminalPdFailure(err)) throw err;
        // the old order is dead for good; record that and order fresh below
        await db.instantOrder
          .update({ where: { id: pending.id }, data: { status: "failed", error: errorMessage(err, String(err)) } })
          .catch(() => {});
      }
    }
  }

  // 3. buy — pack by pack, skipping what the address already has. A re-measure
  // on an address that has every pack is the one case that orders everything again.
  const hasAll = PD_DIAGRAM_PACKS.every((p) => owned.have.includes(p));
  const skip = forceNewOrder && hasAll ? [] : owned.have;
  const base = skip.length && owned.parts.length ? mergeInstantResults(owned.parts) : null;
  const { instant, report } = await orderPacksFor(input, orderDeps(organizationId, addressKey, input), { skip, base });
  return { instant, packs: report };
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

/**
 * Сегменты Google Solar для арбитра состава (приказ 2026-08-30) — в кадр-ft
 * от origin. Solar бесплатен; отказ сети не валит замер: арбитр — свидетель,
 * не условие.
 */
async function googleSegsFor(origin: { lat: number; lng: number }): Promise<ArbiterSegment[] | null> {
  if (!isSolarEnabled()) return null;
  try {
    const bi = await getBuildingInsights(origin.lat, origin.lng);
    return bi.segments.map((s) => ({
      azDeg: s.azimuthDegrees,
      pitchDeg: s.pitchDegrees,
      areaSf: s.areaMeters2 * FT_PER_M * FT_PER_M,
      xFt: (s.centerLng - origin.lng) * D2R * EARTH_R_M * Math.cos(origin.lat * D2R) * FT_PER_M,
      yFt: (s.centerLat - origin.lat) * D2R * EARTH_R_M * FT_PER_M,
    }));
  } catch (err) {
    console.warn("[roofMeasurement] Google-арбитр недоступен:", errorMessage(err, String(err)));
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
 * Замер: добыть Instant (леджер/идемпотентность/дозабор), добыть
 * DSM/Solar (бесплатно), зарегистрировать контур к растру, померить
 * покрытие и completeness, прочитать Google-сегменты, применить
 * парсель-вето — и сохранить ДАННЫЕ. Чертёж не строится.
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
  if (!isEagleViewEnabled()) return { ok: false, error: "EagleView is not configured" };
  if (!input.address && input.lat == null) return { ok: false, error: "Pick an address first" };

  // Instant: через леджер заказов (переиспользование, дозабор, покупка)
  let instant: InstantRoofData;
  let reuse: { requestId: string; how: "stored" | "recovered" } | undefined;
  let packs: PackReport;
  try {
    const got = await obtainInstant(input, organizationId, opts?.forceNewOrder === true);
    instant = got.instant;
    reuse = got.reuse;
    packs = got.packs;
  } catch (err) {
    const debug = { ...eagleViewIdentity(), stage: "instant order", error: errorMessage(err, String(err)) };
    console.warn("[roofMeasurement] instant failed", debug);
    return { ok: false, error: errorMessage(err, "EagleView Instant request failed"), debug };
  }
  const debug = { ...eagleViewIdentity(), packs, reused: reuse ?? null, requestId: instant.requestId };

  const origin: LatLng | null = instant.lat != null && instant.lng != null ? { lat: instant.lat, lng: instant.lng } : null;
  const contours = instant.structures.map((st) => st.outline ?? []).filter((r) => r.length >= 3);
  // контуры Instant приходят в lat/lng — в кадр-футы от пина
  const frameContours: FootprintPoint[][] = origin
    ? contours.map((r) => latLngRingToFrame(origin, r).ring as FootprintPoint[])
    : [];

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
  const mainRing: FootprintPoint[] | null =
    origin && mainSt?.outline && mainSt.outline.length >= 3
      ? (latLngRingToFrame(origin, mainSt.outline).ring as FootprintPoint[])
      : frameContours[0] ?? null;
  const mainContours: FootprintPoint[][] = mainRing ? [mainRing] : frameContours;

  // DSM/Solar (бесплатно): покрытие и регистрация; отказ не валит замер
  let recon: ReconBuild | null = null;
  if (isSolarEnabled()) {
    try {
      recon = await withDeadline(
        buildReconModel({
          ...input,
          ...(opts?.forceNewOrder === true ? { refreshSolar: true } : {}),
          ...(contours.length ? { contours } : {}),
        }),
        RECON_DEADLINE_MS,
        "Roof reconstruction data",
      );
    } catch (err) {
      provenance.reconUnavailable = { kind: reconFailureKind(err), message: errorMessage(err, String(err)) };
    }
  } else {
    provenance.reconUnavailable = { kind: "unreachable" as SolarFailureKind, message: "Google Solar is not configured" };
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
    const ring0 = mainRing;
    if (ring0) {
      try {
        const reg = registerContourToRaster({
          contour: ring0,
          mask: recon.mask as never,
          dsm: recon.dsm as never,
          groundElevFt: recon.diagnostics.groundElevFt,
        });
        if (reg.applied)
          provenance.registration = {
            dxFt: reg.transform.dxFt,
            dyFt: reg.transform.dyFt,
            thetaDeg: reg.transform.thetaDeg,
          } as unknown as MeasurementProvenance["registration"];
      } catch {
        /* регистрация — свидетель, не условие */
      }
    }
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
    // shape confidence.ts already reads.
    try {
      const regT = provenance.registration as { dxFt: number; dyFt: number; thetaDeg: number } | undefined;
      const pitchLabel = mainSt?.pitch ?? instant.totals.pitchLabel;
      const instantPitch12 = pitchLabel ? Number(pitchLabel.split("/")[0]) : null;
      const solarPanels = mainSt ? mainSt.solarPanels === true : instant.structures.some((st) => st.solarPanels === true);
      const pitchRep = measurePitch({
        dsm: recon.dsm as never,
        contours: mainContours,
        transform: regT ?? null,
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
  const planAreaSqft = mainContours.reduce((s, r) => s + Math.abs(areaOf(r)), 0);
  const completeness = checkCompleteness({
    mainIndex: pick.index,
    planAreaSqft,
    structures: instant.structures.map((st, i) => {
      const fr = origin && st.outline && st.outline.length >= 3 ? (latLngRingToFrame(origin, st.outline).ring as FootprintPoint[]) : null;
      return {
        prefix: "s" + i,
        ring: fr,
        contourAreaSqft: fr ? Math.abs(areaOf(fr)) : 0,
      };
    }),
    instant,
    // No outline is not a lost building when the outline pack was never
    // bought: pack 007 refused or not attempted → a note, not an error.
    outlinesNotPurchased: !packs.have.includes(PD_PACK.OUTLINES),
  });
  provenance.completeness = {
    findings: completeness.findings,
    planSqft: completeness.planSqft,
    instantSqft: (completeness as unknown as { instantSqft?: number | null }).instantSqft ?? null,
  } as unknown as MeasurementProvenance["completeness"];
  provenance.instantPacks = packs;

  // Google-сегменты: чтение roofSegmentStats (свидетель)
  if (origin) {
    const segs = await googleSegsFor(origin);
    if (segs) (provenance as Record<string, unknown>).googleSegments = { count: segs.length };
  }

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
const STATICMAP_DIR = join(process.cwd(), ".cache", "staticmap");
const STATICMAP_PX = 640; // logical size; scale=2 doubles the pixels

/** One fixed zoom for every address — the standard Google Maps address view
 *  (owner's call: no per-lot fitting at all; the pin centres the house). */
const STATICMAP_ZOOM = 20;

export async function getMeasurementPhoto(
  id: string,
): Promise<{ ok: true; dataUrl: string; zoom: number } | { ok: false; error: string }> {
  const ctx = await requireEstimatorOrManager();
  const row = await db.roofMeasurement.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { address: true, city: true, state: true, zip: true, lat: true, lng: true, instantJson: true },
  });
  if (!row) return { ok: false, error: "Measurement not found" };
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return { ok: false, error: "Google Maps is not configured (GOOGLE_MAPS_API_KEY)" };
  }

  let lat = row.lat;
  let lng = row.lng;
  if ((lat == null || lng == null) && row.instantJson) {
    // Older rows sometimes carry no pin — the outlines' centre serves.
    try {
      const instant = JSON.parse(row.instantJson) as InstantRoofData;
      const all = instant.structures.flatMap((st) => st.outline ?? []);
      if (all.length) {
        lat = all.reduce((s, p) => s + p.lat, 0) / all.length;
        lng = all.reduce((s, p) => s + p.lng, 0) / all.length;
      }
    } catch {
      /* photo can still come from the pin */
    }
  }
  if (lat == null || lng == null) return { ok: false, error: "No coordinates on this measurement" };
  const zoom = STATICMAP_ZOOM;

  // ── disk cache, keyed by the address (per owner) + zoom ──
  const keyBase = instantAddressKey({
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? "",
  }).replace(/[^A-Za-z0-9]+/g, "-");
  const file = join(STATICMAP_DIR, `${keyBase}-z${zoom}.png`);
  try {
    const cached = await fs.readFile(file);
    return { ok: true, dataUrl: "data:image/png;base64," + cached.toString("base64"), zoom };
  } catch {
    /* miss — fetch below */
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${STATICMAP_PX}x${STATICMAP_PX}`,
    scale: "2",
    maptype: "satellite",
    key: process.env.GOOGLE_MAPS_API_KEY,
  });
  try {
    const res = await withDeadline(
      fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`, { cache: "no-store" }),
      8_000,
      "Static map",
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Static Maps refused (${res.status})${detail ? `: ${detail.slice(0, 120)}` : ""}` };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    try {
      await fs.mkdir(STATICMAP_DIR, { recursive: true });
      await fs.writeFile(file, bytes);
    } catch {
      /* cache is an optimisation; a failed write costs one repeat request */
    }
    return { ok: true, dataUrl: "data:image/png;base64," + bytes.toString("base64"), zoom };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Satellite photo unavailable") };
  }
}

/** Орто EagleView (данные, без чертежа) — НЕ используется страницей: владелец
 *  выбрал снимок Google Maps (getMeasurementPhoto выше). Оставлено для
 *  будущего рестайла. */
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
