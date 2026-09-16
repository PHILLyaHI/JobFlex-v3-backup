"use server";

// HVAC estimator — the server side.
//
// What the server does here, and only this: it looks the site up (parcel,
// footprints, county, elevation, any roof measurement on file), it reads a
// nameplate photo with the vision model and hands the RULES module the text,
// it keeps the shop's catalog and rate card, it saves the estimate and it
// converts the priced draft into a proposal. The load, the selection and the
// checks run in src/lib/hvac — pure functions the browser runs too, so the
// design card updates as the contractor types without a round trip.
//
// DEPLOY NOTE: HvacEstimate / HvacCatalogItem / HvacSettings are new tables
// (2026-09-15). Until `prisma db push` has created them, every read below
// answers its default (starter catalog, default rate card, no history) and
// every write reports the failure instead of throwing — the RoofCatalog rule.
//
// Same gates as the other estimators: role, then the org's AI rate limit, then
// the plan's estimatorUses meter on the calls that spend a model run.

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalStatus } from "@/lib/prismaEnums";
import { checkPlanLimit, enforcePlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import { enforceRateLimit, HOUR } from "@/lib/rateLimit";
import { geocodePlace, isMapsEnabled } from "@/lib/maps";
import { censusGeocode, countyAtPoint } from "@/lib/hvac/publicGeo";
import { coolCalcConfig, coolCalcCreateProject, coolCalcCreateSystem, isCoolCalcEnabled, splitAddress } from "@/lib/hvac/coolcalc";
import { parseDirectoryCsv } from "@/lib/hvac/directory";
import { calibrationStats, type CalibrationStats } from "@/lib/hvac/calibration";
import { elevationForPoints } from "@/lib/elevationProfile";
import { fetchPropertyBoundary } from "@/actions/fenceBoundary";
import { lookupParcelByPoint } from "@/lib/parcelLookup";
import { fetchRegridPoint, isRegridEnabled } from "@/lib/parcel";
import { regridRecordOf } from "@/lib/hvac/regridRecord";
import { assessorRecordAt } from "@/lib/hvac/assessors";
import { runVisionJson } from "@/lib/sdk/openaiVision";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { stateFromAddress } from "@/lib/pricing/salesTax";
import type { CatalogItem } from "@/lib/hvac/types";
import { pickBuilding, ringGeometry, storeysFromHeight } from "@/lib/hvac/site";
import type { SiteFacts, NameplateRead } from "@/lib/hvac/intake";
import { DEFAULT_RATE_CARD, STARTER_CATALOG, parseCatalogCsv, type HvacRateCard } from "@/lib/hvac/ledger";

type Fail = { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey };

const parseJson = <T,>(s: string | null | undefined): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };

const missingTable = (err: unknown) => /does not exist|no such table|relation .* Hvac/i.test(err instanceof Error ? err.message : String(err));

async function runBlocked(organizationId: string): Promise<Fail | null> {
  const quota = await checkPlanLimit(organizationId, "estimatorUses");
  if (quota.allowed) return null;
  return { ok: false, error: PLAN_LIMIT_MESSAGE, code: "PLAN_LIMIT_REACHED", resource: quota.cappedBy ?? "estimatorUses" };
}

// ── site facts ──────────────────────────────────────────────────────────────

const siteInput = z.object({
  address: z.string().min(3).max(300),
  state: z.string().max(2).optional(),
  county: z.string().max(80).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

/** Everything the server knows about a site before a question is asked. Never
 *  throws on a lookup: each fact is independent and the badges say which came. */
export async function hvacSiteFacts(raw: unknown): Promise<{ ok: true; facts: SiteFacts; warnings: string[] } | Fail> {
  let input: z.infer<typeof siteInput>;
  try {
    input = siteInput.parse(raw);
  } catch {
    return { ok: false, error: "Enter an address first." };
  }
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    await enforceRateLimit(`hvac-site:${organizationId}`, 40, HOUR, "site lookups");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }

  const warnings: string[] = [];
  const facts: SiteFacts = { address: input.address.trim(), state: (input.state ?? stateFromAddress(input.address) ?? "").toUpperCase(), county: input.county, lat: input.lat, lng: input.lng, sources: {} };

  // 1 · county + point. Google first when the server has a key (rooftop
  // precision), the Census Bureau geocoder otherwise or when Google refuses
  // — it is free and keyless and answers the county in the same call. A pin
  // without a county asks the FCC block API. The badge says which answered.
  if (facts.county) facts.sources.county = "picked";
  const needPoint = facts.lat === undefined || facts.lng === undefined;
  if (needPoint || !facts.county || !facts.state) {
    const g = isMapsEnabled() ? await geocodePlace(facts.address) : null;
    if (g) {
      if (needPoint) { facts.lat = g.lat; facts.lng = g.lng; }
      if (!facts.county && g.county) { facts.county = g.county; facts.sources.county = "Google geocoder"; }
      if (!facts.state && g.state) facts.state = g.state.toUpperCase();
    }
    if (facts.lat === undefined || facts.lng === undefined || !facts.county) {
      const c = await censusGeocode(facts.address);
      if (c) {
        if (facts.lat === undefined || facts.lng === undefined) { facts.lat = c.lat; facts.lng = c.lng; facts.sources.point = "Census Bureau geocoder"; }
        if (!facts.county && c.county) { facts.county = c.county; facts.sources.county = "Census Bureau geocoder"; }
        if (!facts.state && c.state) facts.state = c.state.toUpperCase();
      }
    }
    if (!facts.county && facts.lat !== undefined && facts.lng !== undefined) {
      const f = await countyAtPoint(facts.lat, facts.lng);
      if (f) { facts.county = f.county; facts.sources.county = "FCC census block"; if (!facts.state) facts.state = f.state; }
    }
    if (!facts.county) warnings.push("Couldn't resolve the county for this address — pick it so the design temperatures are the county's, not the state median.");
  }
  if (!facts.state) return { ok: false, error: "Couldn't tell the state from that address — add the state (e.g. TX)." };

  if (facts.lat === undefined || facts.lng === undefined) {
    warnings.push("No map point for this address — footprint and elevation skipped. Check the spelling, or pick it from the suggestions.");
    return { ok: true, facts, warnings };
  }

  // 2 · the assessor's record for the lot the pin is in: living area, year
  // built, storeys, county and the building polygons. First, so the footprint
  // lookup below reads the cache instead of spending a second quota.
  const parcel = await lookupParcelByPoint(facts.lat, facts.lng, { withRecord: true }).catch(() => null);
  const rec = parcel && parcel.ok ? parcel.parcel : null;
  const RECORD = "county parcel record";
  if (rec) {
    if (rec.bldgSqft && rec.bldgSqft >= 300 && rec.bldgSqft <= 20_000) { facts.livingSqft = rec.bldgSqft; facts.sources.living = RECORD; }
    if (rec.yearBuilt) { facts.yearBuilt = rec.yearBuilt; facts.sources.yearBuilt = RECORD; }
    if (rec.storeys) { facts.storeys = rec.storeys; facts.sources.storeys = `${RECORD}: ${rec.storeys} storeys`; }
    if (rec.landUseClass) facts.landUse = rec.landUseClass;
    if (!facts.county && rec.countyName) { facts.county = rec.countyName; facts.sources.county = RECORD; }
    if (!facts.state && rec.stateAbbr) facts.state = rec.stateAbbr;
    if (rec.landUseClass && !/residential/i.test(rec.landUseClass)) warnings.push(`The assessor classes this lot as ${rec.landUseClass} — the residential defaults may not fit.`);
  }

  // 2a · the county's own open-data layer, where one exists (free, keyless;
  // src/lib/hvac/assessors.ts) — the assessor's figures at the source.
  if (!facts.livingSqft || !facts.yearBuilt || !facts.storeys) {
    const ca = await assessorRecordAt(facts.state, facts.county, facts.lat, facts.lng);
    if (ca) {
      if (!facts.livingSqft && ca.livingSqft) { facts.livingSqft = ca.livingSqft; facts.sources.living = ca.source; }
      if (!facts.yearBuilt && ca.yearBuilt) { facts.yearBuilt = ca.yearBuilt; facts.sources.yearBuilt = ca.source; }
      if (!facts.storeys && ca.storeys) { facts.storeys = ca.storeys; facts.sources.storeys = `${ca.source}: ${ca.storeys} storeys`; }
      if (!facts.landUse && ca.landUse) facts.landUse = ca.landUse;
    }
  }

  // 2b · Regrid's copy of the assessor's record fills what the first source
  // lacks (Snohomish and King publish no year built or living area on any
  // public service; Regrid licenses the assessor feed). One call per lookup,
  // and the answer is written back onto the cached parcel row so the next
  // lookup of this house costs nothing.
  if ((!facts.livingSqft || !facts.yearBuilt || !facts.storeys) && isRegridEnabled()) {
    const rg = await fetchRegridPoint(facts.lat, facts.lng).then((r) => regridRecordOf(r.data)).catch(() => null);
    if (rg) {
      const RG = "Regrid parcel record";
      if (!facts.livingSqft && rg.livingSqft) { facts.livingSqft = rg.livingSqft; facts.sources.living = `${RG} (${rg.areaField === "recrdareno" ? "assessor's recorded area" : "total building area"})`; }
      if (!facts.yearBuilt && rg.yearBuilt) { facts.yearBuilt = rg.yearBuilt; facts.sources.yearBuilt = RG; }
      if (!facts.storeys && rg.storeys) { facts.storeys = rg.storeys; facts.sources.storeys = `${RG}: ${rg.storeys} storeys`; }
      if (!facts.landUse && rg.useDesc) facts.landUse = rg.useDesc;
      if (rec) {
        db.parcelCache.update({ where: { robustId: rec.robustId }, data: { ...(rec.bldgSqft ? {} : { bldgSqft: rg.livingSqft ?? null }), ...(rec.yearBuilt ? {} : { yearBuilt: rg.yearBuilt ?? null }), ...(rec.storeys ? {} : { storeys: rg.storeys ?? null }) } }).catch(() => undefined);
      }
    }
  }
  if (rec) {
    const missing = [!facts.livingSqft && "living area", !facts.yearBuilt && "year built", !facts.storeys && "storeys"].filter(Boolean);
    if (rec.enriched && missing.length) warnings.push(`The county record here doesn't carry the ${missing.join(", ")} — ${isRegridEnabled() ? "" : "a Regrid key on the server would fill them for most counties; until then "}say ${missing.length === 1 ? "it" : "them"} on the walk or type ${missing.length === 1 ? "it" : "them"}.`);
  }

  // 3 · the footprint the pin is in — the assessor's polygons when the record
  // carries them, else the parcel/OSM lookup — and 4 · elevation. Independent;
  // a failure in one leaves the other alone.
  const [site, elev] = await Promise.all([
    rec && rec.buildings.length ? Promise.resolve({ ok: true as const, buildings: rec.buildings.map((ring) => ({ ring: ring.map(([la, ln]) => ({ lat: la, lng: ln })), heightFt: null })), error: undefined as string | undefined, fromRecord: true }) : fetchPropertyBoundary(facts.lat, facts.lng).then((s) => ({ ...s, fromRecord: false })).catch(() => null),
    elevationForPoints([{ lat: facts.lat, lng: facts.lng }, { lat: facts.lat + 0.00002, lng: facts.lng }], organizationId).catch(() => null),
  ]);
  if (site) {
    const pick = pickBuilding(site.buildings, facts.lat, facts.lng);
    if (pick) {
      const g = ringGeometry(pick.building.ring);
      if (g.areaSqft >= 300 && g.areaSqft <= 20_000) {
        facts.footprintSqft = g.areaSqft;
        facts.perimeterFt = g.perimeterFt;
        facts.footprintEdges = g.edges;
        facts.sources.footprint = site.fromRecord ? (pick.inside ? "building outline on the parcel record" : "nearest building outline on the parcel record") : pick.inside ? "building footprint at the pin" : "nearest building footprint — confirm it is the house";
        if (!pick.inside && !site.fromRecord) warnings.push("The pin is not inside a building footprint; the nearest one was used. Confirm the area.");
        const storeys = storeysFromHeight(pick.building.heightFt);
        if (storeys) {
          facts.storeys = storeys;
          facts.sources.storeys = `building height ${Math.round(pick.building.heightFt ?? 0)} ft on the footprint record`;
        }
      }
    } else if (!facts.livingSqft) {
      warnings.push("No building footprint or living area on record here — say the square footage on the walk or type it.");
    }
    if (!site.ok && site.error && !/REPORTALL_CLIENT_KEY/.test(site.error)) warnings.push(site.error);
  } else if (!facts.livingSqft) {
    warnings.push("No building footprint or living area on record here — say the square footage on the walk or type it.");
  }
  if (elev && elev.ok && elev.elevFt.length) {
    facts.elevationFt = Math.round(elev.elevFt[0]);
    facts.sources.elevation = elev.source === "usgs-3dep" ? "USGS 3DEP" : "Google Elevation";
  }

  // 4 · a roof measurement on file for this address (EagleView Instant).
  try {
    const rm = await db.roofMeasurement.findFirst({
      where: { organizationId, lat: { gte: facts.lat - 0.0003, lte: facts.lat + 0.0003 }, lng: { gte: facts.lng - 0.0004, lte: facts.lng + 0.0004 } },
      orderBy: { createdAt: "desc" },
      select: { areaSqft: true, predominantPitch: true },
    });
    if (rm) {
      facts.roof = { areaSqft: rm.areaSqft ?? undefined, pitch: rm.predominantPitch ?? undefined };
      facts.sources.roof = "roof measurement on file";
    }
  } catch {
    /* column names differ on an older schema — the roof is optional */
  }

  return { ok: true, facts, warnings };
}

// ── nameplate reading ───────────────────────────────────────────────────────

const NAMEPLATE_SYSTEM = `You read HVAC equipment nameplates (rating plates) from a photo and return JSON only.
Return exactly this object; use null for anything not printed on the plate — never guess:
{"kind":"outdoor"|"furnace"|"air-handler"|"package"|"water-heater"|"other","brand":string|null,"model":string|null,"serial":string|null,"tons":number|null,"btuInput":number|null,"seer":number|null,"afue":number|null,"refrigerant":string|null,"yearMade":number|null,"voltage":string|null,"mcaAmps":number|null,"confidence":"high"|"medium"|"low","notes":string|null}
Rules: "model" and "serial" are copied character for character (letters, digits, dashes). "tons" only when the plate prints a BTU/h cooling rating or the word tons (36,000 BTU/h = 3 tons); "btuInput" is a furnace INPUT rating in BTU/h; "yearMade" only when a manufacture date is printed; "mcaAmps" is Minimum Circuit Ampacity. "confidence" is how legible the plate is. "notes" is one short sentence on what was hard to read.`;

const INLINE_IMG = /^data:image\/(jpe?g|png|webp);base64,[A-Za-z0-9+/=]+$/i;

/** One nameplate photo → the fields on it. The rules module then decodes the
 *  model number itself, so a misread capacity never goes unchecked. */
export async function readHvacNameplate(raw: unknown): Promise<{ ok: true; read: NameplateRead } | Fail> {
  const parsed = z.object({ dataUrl: z.string().max(2_500_000), hint: z.enum(["outdoor", "indoor", "panel", "other"]).default("other") }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid photo payload" };
  if (!INLINE_IMG.test(parsed.data.dataUrl)) return { ok: false, error: "That photo isn't a JPEG/PNG the browser rendered." };
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    await enforceRateLimit(`ai:${organizationId}`, 60, HOUR, "AI runs");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }
  const blocked = await runBlocked(organizationId);
  if (blocked) return blocked;
  if (!isOpenAIEnabled()) return { ok: false, error: "Nameplate reading needs OPENAI_API_KEY — type the plate's model number instead." };

  const hintLine = parsed.data.hint === "outdoor" ? "This should be the OUTDOOR unit (condenser / heat pump) plate." : parsed.data.hint === "indoor" ? "This should be the INDOOR unit (furnace or air handler) plate." : parsed.data.hint === "panel" ? "This is an electrical panel: read the MAIN BREAKER amps into mcaAmps, set kind to \"other\" and put the count of free breaker slots in notes." : "";
  const out = await runVisionJson<Record<string, unknown>>({ systemPrompt: NAMEPLATE_SYSTEM, userPrompt: `Read this nameplate. ${hintLine}`.trim(), imageUrl: parsed.data.dataUrl });
  if (!out) return { ok: false, error: "The plate couldn't be read — try a closer, straight-on photo." };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const kindRaw = s(out.kind) ?? "other";
  const kind = (["outdoor", "furnace", "air-handler", "package", "water-heater", "other"] as const).find((k) => k === kindRaw) ?? "other";
  const conf = (["high", "medium", "low"] as const).find((c) => c === out.confidence) ?? "low";
  return {
    ok: true,
    read: { kind, brand: s(out.brand), model: s(out.model), serial: s(out.serial), tons: n(out.tons), btuInput: n(out.btuInput), seer: n(out.seer), afue: n(out.afue), refrigerant: s(out.refrigerant), yearMade: n(out.yearMade), voltage: s(out.voltage), mcaAmps: n(out.mcaAmps), confidence: conf, notes: s(out.notes) },
  };
}

// ── catalog ─────────────────────────────────────────────────────────────────

/** The org's catalog, or the starter ladder when it has none (or the table is
 *  not pushed yet). `own` says which. */
export async function listHvacCatalog(): Promise<{ items: CatalogItem[]; own: boolean }> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const rows = await db.hvacCatalogItem.findMany({ where: { organizationId }, orderBy: [{ kind: "asc" }, { brand: "asc" }, { model: "asc" }] });
    if (rows.length) return { items: rows.map((r) => JSON.parse(r.itemJson) as CatalogItem), own: true };
  } catch {
    /* table not pushed yet */
  }
  return { items: STARTER_CATALOG, own: false };
}

export async function importHvacCatalogCsv(raw: unknown): Promise<{ ok: true; imported: number; errors: string[]; note?: string } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const parsed = z.object({ csv: z.string().max(2_000_000), replace: z.boolean().default(false) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid import payload" };
  // The shop template has a `kind` column; an AHRI or NEEP export does not,
  // and is read by meaning instead.
  const firstLine = parsed.data.csv.split(/\r?\n/)[0] ?? "";
  const isShop = /(^|,)\s*"?kind"?\s*(,|$)/i.test(firstLine);
  const dir = isShop ? null : parseDirectoryCsv(parsed.data.csv);
  const { items, errors } = dir && dir.source ? { items: dir.items, errors: dir.errors } : parseCatalogCsv(parsed.data.csv);
  const note = dir && dir.source ? `Read as a ${dir.source.toUpperCase()} export · columns used: ${Object.values(dir.recognised).join(", ")}` : undefined;
  if (!items.length) return { ok: false, error: (dir && !dir.source ? dir.errors[0] : errors[0]) ?? "No rows to import." };
  try {
    if (parsed.data.replace) await db.hvacCatalogItem.deleteMany({ where: { organizationId } });
    for (const item of items) {
      await db.hvacCatalogItem.upsert({
        where: { organizationId_itemId: { organizationId, itemId: item.id } },
        create: { organizationId, itemId: item.id, kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) },
        update: { kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) },
      });
    }
    return { ok: true, imported: items.length, errors, note };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The catalog table isn't in this database yet — run `prisma db push`, then import again." : `Couldn't import — ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}

export async function clearHvacCatalog(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    await db.hvacCatalogItem.deleteMany({ where: { organizationId } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The catalog table isn't in this database yet." : "Couldn't clear the catalog." };
  }
}

// ── rate card ───────────────────────────────────────────────────────────────

const money = z.number().min(0).max(1_000_000);
const hours = z.number().min(0).max(200);
const rateCardSchema = z.object({
  laborRatePerHour: money,
  helperRatePerHour: money,
  equipmentMarkupPct: z.number().min(0).max(300),
  materialsMarkupPct: z.number().min(0).max(300),
  permitFee: money,
  disposalFee: money,
  craneFee: money,
  hours: z.object({
    removeSplit: hours, removePackage: hours, setOutdoor: hours, setAirHandler: hours, setFurnace: hours, setCoil: hours, setPackage: hours, lineset: hours, electrical: hours, electricalUpgradeRun: hours, gasPipe: hours, returnUpsize: hours, ductSeal: hours, thermostat: hours, startup: hours,
  }),
  materials: z.object({
    pad: money, linesetPerFt: money, disconnect: money, whipKit: money, drainKit: money, condensatePump: money, thermostat: money, surgeProtector: money, gasFlexKit: money, breakerAndWirePerFt: money, breaker: money, returnGrilleUpsize: money, ductSealKit: money, backupHeatKitPerKw: money, refrigerantPerLb: money,
  }),
  equipmentDefaults: z.object({
    airConditionerPerTon: money, heatPumpPerTon: money, coldClimateHeatPumpPerTon: money, packagePerTon: money, ductlessPerTon: money, coilPerTon: money, airHandlerPerTon: money, furnacePer10kBtu: money,
  }),
  linesetFtDefault: z.number().min(0).max(500),
});

export async function getHvacRateCard(): Promise<{ card: HvacRateCard; own: boolean }> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const row = await db.hvacSettings.findUnique({ where: { organizationId } });
    if (row) {
      const parsed = rateCardSchema.safeParse(JSON.parse(row.rateCardJson));
      if (parsed.success) return { card: parsed.data, own: true };
    }
  } catch {
    /* table not pushed yet, or a row that no longer validates */
  }
  return { card: DEFAULT_RATE_CARD, own: false };
}

export async function saveHvacRateCard(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const parsed = rateCardSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The rate card didn't validate${issue ? ` — ${issue.path.join(".")}: ${issue.message}` : ""}.` };
  }
  const rateCardJson = JSON.stringify(parsed.data);
  try {
    await db.hvacSettings.upsert({ where: { organizationId }, create: { organizationId, rateCardJson }, update: { rateCardJson } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The settings table isn't in this database yet — run `prisma db push`, then save again. Your card stays in this browser meanwhile." : `Couldn't save — ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}

// ── the estimate ────────────────────────────────────────────────────────────

const lineSchema = z.object({ name: z.string().max(200), quantity: z.number().min(0), unitPrice: z.number().min(0), unit: z.string().max(40).optional(), basis: z.string().max(20).optional(), note: z.string().max(400).optional() });
const draftSchema = z.object({
  title: z.string().max(200),
  scope: z.string().max(6000),
  materials: z.array(lineSchema).max(80),
  labor: z.array(lineSchema).max(80),
  assumptions: z.array(z.string().max(500)).max(40),
});
const saveSchema = z.object({
  id: z.string().optional(),
  address: z.string().min(3).max(300),
  siteFacts: z.unknown(),
  model: z.unknown(),
  engine: z.unknown(),
  draft: draftSchema,
});

export interface HvacActual {
  tons?: number;
  price?: number;
  model?: string;
  notes?: string;
  recordedAt?: string;
}
export interface HvacPermit {
  provider: "coolcalc";
  projectId: string;
  systemId: string;
  projectUrl: string;
  reportUrl: string;
  requestedAt: string;
  attachedAt?: string;
}
export interface HvacEstimateSummary {
  id: string;
  address: string;
  status: string;
  subtotal: number;
  createdAt: string;
  title: string;
  sizedTons: number | null;
  actual: HvacActual | null;
  permit: "none" | "requested" | "attached";
  approvedReportUrl: string | null;
}

export async function saveHvacEstimate(raw: unknown): Promise<{ ok: true; id: string } | Fail> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid estimate payload" };
  let organizationId: string;
  let userId: string;
  try {
    const ctx = await requireEstimatorOrManager();
    organizationId = ctx.organizationId;
    userId = ctx.user.id;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Not allowed" };
  }
  const d = parsed.data;
  const model = (d.model ?? {}) as { state?: string; county?: string };
  const subtotal = [...d.draft.materials, ...d.draft.labor].reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const eng = (d.engine ?? {}) as { selection?: { systems?: number; targetTons?: number; chosen?: { item?: { tons?: number } } | null } };
  const perSystem = eng.selection?.chosen?.item?.tons ?? eng.selection?.targetTons;
  const sizedTons = perSystem ? Math.round(perSystem * (eng.selection?.systems ?? 1) * 10) / 10 : null;
  const data = {
    organizationId,
    createdById: userId,
    address: d.address,
    state: typeof model.state === "string" ? model.state : null,
    county: typeof model.county === "string" ? model.county : null,
    siteFactsJson: JSON.stringify(d.siteFacts ?? {}),
    modelJson: JSON.stringify(d.model ?? {}),
    engineJson: JSON.stringify(d.engine ?? {}),
    draftJson: JSON.stringify(d.draft),
    subtotal: Math.round(subtotal * 100) / 100,
    sizedTons,
  };
  try {
    if (d.id) {
      const own = await db.hvacEstimate.findFirst({ where: { id: d.id, organizationId }, select: { id: true } });
      if (own) {
        await db.hvacEstimate.update({ where: { id: own.id }, data });
        return { ok: true, id: own.id };
      }
    }
    const row = await db.hvacEstimate.create({ data });
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The HVAC tables aren't in this database yet — run `prisma db push` to keep estimates." : `Couldn't save — ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}

export async function listHvacEstimates(): Promise<HvacEstimateSummary[]> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const rows = await db.hvacEstimate.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, address: true, status: true, subtotal: true, createdAt: true, draftJson: true, sizedTons: true, actualJson: true, permitJson: true, approvedReportUrl: true } });
    return rows.map((r) => {
      const title = String(parseJson<{ title?: string }>(r.draftJson)?.title ?? "");
      const permit = parseJson<HvacPermit>(r.permitJson);
      return { id: r.id, address: r.address, status: r.status, subtotal: r.subtotal, createdAt: r.createdAt.toISOString(), title, sizedTons: r.sizedTons, actual: parseJson<HvacActual>(r.actualJson), permit: r.approvedReportUrl ? "attached" : permit ? "requested" : "none", approvedReportUrl: r.approvedReportUrl };
    });
  } catch {
    return [];
  }
}

/** The calibration loop over every saved estimate with an actual. */
export async function hvacCalibration(): Promise<CalibrationStats> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const rows = await db.hvacEstimate.findMany({ where: { organizationId, actualJson: { not: null } }, select: { sizedTons: true, subtotal: true, actualJson: true } });
    return calibrationStats(rows.map((r) => { const a = parseJson<HvacActual>(r.actualJson); return { sizedTons: r.sizedTons, subtotal: r.subtotal, actualTons: a?.tons ?? null, actualPrice: a?.price ?? null }; }));
  } catch {
    return calibrationStats([]);
  }
}

const actualSchema = z.object({ tons: z.number().min(0.5).max(40).optional(), price: z.number().min(0).max(10_000_000).optional(), model: z.string().max(120).optional(), notes: z.string().max(1000).optional() });

/** Record what was actually quoted or installed for a saved estimate. */
export async function recordHvacActual(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.object({ estimateId: z.string(), actual: actualSchema }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid actuals" };
  const { organizationId } = await requireEstimatorOrManager();
  const a = parsed.data.actual;
  if (a.tons === undefined && a.price === undefined) return { ok: false, error: "Enter the tons or the price." };
  try {
    const n = await db.hvacEstimate.updateMany({ where: { id: parsed.data.estimateId, organizationId }, data: { actualJson: JSON.stringify({ ...a, recordedAt: new Date().toISOString() }) } });
    return n.count ? { ok: true } : { ok: false, error: "That estimate isn't here any more." };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The HVAC tables aren't in this database yet." : `Couldn't record — ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}

// ── permit-grade report (Cool Calc) ─────────────────────────────────────────

export async function hvacPermitStatus(): Promise<{ enabled: boolean }> {
  await requireEstimatorOrManager();
  return { enabled: isCoolCalcEnabled() };
}

/** Create the Cool Calc project and system for a saved estimate (once), so
 *  the contractor finishes the envelope in Cool Calc and the report can be
 *  pulled back. Idempotent: a second call answers the existing ids. */
export async function requestHvacPermitReport(raw: unknown): Promise<{ ok: true; permit: HvacPermit; appUrl: string } | { ok: false; error: string }> {
  const parsed = z.object({ estimateId: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Save the estimate first." };
  const { organizationId } = await requireEstimatorOrManager();
  await enforceRateLimit(`coolcalc:${organizationId}`, 20, HOUR, "Cool Calc requests");
  const cfg = coolCalcConfig();
  if (!cfg) return { ok: false, error: "Cool Calc isn't connected — set COOLCALC_CLIENT_ID, COOLCALC_API_KEY and COOLCALC_DEALER_ID on the server." };
  let row: { id: string; address: string; draftJson: string; permitJson: string | null; engineJson: string } | null;
  try {
    row = await db.hvacEstimate.findFirst({ where: { id: parsed.data.estimateId, organizationId }, select: { id: true, address: true, draftJson: true, permitJson: true, engineJson: true } });
  } catch {
    return { ok: false, error: "The HVAC tables aren't in this database yet." };
  }
  if (!row) return { ok: false, error: "That estimate isn't here any more." };
  const existing = parseJson<HvacPermit>(row.permitJson);
  const { COOLCALC_APP_URL } = await import("@/lib/hvac/coolcalc");
  if (existing?.projectId && existing.systemId) return { ok: true, permit: existing, appUrl: COOLCALC_APP_URL };
  const title = String(parseJson<{ title?: string }>(row.draftJson)?.title ?? row.address);
  const parts = splitAddress(row.address);
  try {
    const project = await coolCalcCreateProject(cfg, { project: `${title} · JobFlex ${row.id.slice(-6)}`, address: parts.address, city: parts.city, state: parts.state, zip: parts.zip });
    const systems = Number(parseJson<{ selection?: { systems?: number } }>(row.engineJson)?.selection?.systems ?? 1);
    const system = await coolCalcCreateSystem(cfg, project, systems > 1 ? `System 1 of ${systems}` : "System 1");
    const permit: HvacPermit = { provider: "coolcalc", projectId: project.projectId, systemId: system.systemId, projectUrl: project.projectUrl, reportUrl: system.reportUrl, requestedAt: new Date().toISOString() };
    await db.hvacEstimate.update({ where: { id: row.id }, data: { permitJson: JSON.stringify(permit) } });
    return { ok: true, permit, appUrl: COOLCALC_APP_URL };
  } catch (err) {
    return { ok: false, error: `Cool Calc refused — ${(err instanceof Error ? err.message : String(err)).slice(0, 240)}` };
  }
}

/** Attach the approved report: Cool Calc's own (served through
 *  /api/hvac/permit-report/[id] with the server's credentials) or a link the
 *  contractor pastes. */
export async function attachHvacPermitReport(raw: unknown): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const parsed = z.object({ estimateId: z.string(), url: z.string().max(1000).optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { organizationId } = await requireEstimatorOrManager();
  let url = parsed.data.url?.trim() ?? "";
  if (url && !/^https:\/\//i.test(url)) return { ok: false, error: "The report link must start with https://" };
  try {
    const row = await db.hvacEstimate.findFirst({ where: { id: parsed.data.estimateId, organizationId }, select: { id: true, permitJson: true } });
    if (!row) return { ok: false, error: "That estimate isn't here any more." };
    const permit = parseJson<HvacPermit>(row.permitJson);
    if (!url) {
      if (!permit) return { ok: false, error: "Request the Cool Calc report first, or paste a report link." };
      url = `/api/hvac/permit-report/${row.id}`;
    }
    await db.hvacEstimate.update({ where: { id: row.id }, data: { approvedReportUrl: url, permitJson: permit ? JSON.stringify({ ...permit, attachedAt: new Date().toISOString() }) : row.permitJson } });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: missingTable(err) ? "The HVAC tables aren't in this database yet." : `Couldn't attach — ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` };
  }
}

export async function getHvacEstimate(id: string): Promise<{ ok: true; row: { id: string; address: string; status: string; siteFacts: unknown; model: unknown; engine: unknown; draft: z.infer<typeof draftSchema>; proposalId: string | null; approvedReportUrl: string | null; permit: HvacPermit | null; actual: HvacActual | null } } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const r = await db.hvacEstimate.findFirst({ where: { id, organizationId } });
    if (!r) return { ok: false, error: "That estimate isn't here any more." };
    const draft = draftSchema.safeParse(JSON.parse(r.draftJson));
    if (!draft.success) return { ok: false, error: "That estimate's draft no longer validates." };
    return { ok: true, row: { id: r.id, address: r.address, status: r.status, siteFacts: JSON.parse(r.siteFactsJson), model: JSON.parse(r.modelJson), engine: JSON.parse(r.engineJson), draft: draft.data, proposalId: r.proposalId, approvedReportUrl: r.approvedReportUrl, permit: parseJson<HvacPermit>(r.permitJson), actual: parseJson<HvacActual>(r.actualJson) } };
  } catch {
    return { ok: false, error: "The HVAC tables aren't in this database yet." };
  }
}

// ── convert ─────────────────────────────────────────────────────────────────

function unitToType(unit: string | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u) return "UNIT";
  if (/sq\.?\s*ft|sqft|square\s*f(ee|oo)?t|\bsf\b/.test(u)) return "SQFT";
  if (/lin|\bln\b|\blf\b|\bft\b|f(ee|oo)t/.test(u)) return "LINEAR_FT";
  if (/hour|\bhrs?\b/.test(u)) return "HOUR";
  if (/lot|lump|allowance|flat|fixed|\bjob\b/.test(u)) return "LUMP_SUM";
  return "UNIT";
}

const convertSchema = z.object({
  estimateId: z.string().optional().nullable(),
  /** Set when the estimate carries an approved report; one sentence in the scope. */
  permitNote: z.string().max(300).optional(),
  title: z.string().min(1).max(200),
  scope: z.string().max(6000).optional(),
  materials: z.array(lineSchema).max(80),
  labor: z.array(lineSchema).max(80),
  clientId: z.string().optional().nullable(),
});

/** The roof estimator's convert, line for line: proposal + line items + the
 *  30/70 schedule + the activity row. Assumptions stay on the estimate. */
export async function convertHvacEstimateToProposal(raw: unknown): Promise<{ id: string }> {
  const { organizationId, user } = await requireEstimatorOrManager();
  await enforcePlanLimit(organizationId, "proposalsCreated");
  const data = convertSchema.parse(raw);

  const clientId = data.clientId
    ? ((await db.client.findFirst({ where: { id: data.clientId, organizationId }, select: { id: true } }))?.id ?? null)
    : null;

  const lines = [
    ...data.materials.map((l) => ({ name: l.name, measurementType: unitToType(l.unit), quantity: l.quantity, unitPrice: l.unitPrice, materialCost: l.unitPrice, laborCost: 0, total: l.quantity * l.unitPrice })),
    ...data.labor.map((l) => ({ name: l.name, measurementType: unitToType(l.unit), quantity: l.quantity, unitPrice: l.unitPrice, materialCost: 0, laborCost: l.unitPrice, total: l.quantity * l.unitPrice })),
  ];
  const subtotal = lines.reduce((a, l) => a + l.total, 0);

  const proposal = await db.proposal.create({
    data: {
      publicId: randomUUID(),
      organizationId,
      ownerId: user.id,
      clientId,
      title: data.title,
      scopeOfWork: [data.scope ?? "", data.permitNote ?? ""].filter(Boolean).join("\n\n"),
      status: ProposalStatus.DRAFT,
      subtotal,
      total: subtotal,
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      lineItems: { create: lines.map((l, i) => ({ ...l, position: i })) },
      installments: {
        create: [
          { label: "Deposit", amount: 30, isPercent: true, position: 0 },
          { label: "Completion", amount: 70, isPercent: true, position: 1 },
        ],
      },
    },
  });

  if (data.estimateId) {
    try {
      await db.hvacEstimate.updateMany({ where: { id: data.estimateId, organizationId }, data: { status: "converted", proposalId: proposal.id } });
    } catch {
      /* table not pushed yet */
    }
  }

  await db.activityEvent.create({
    data: { organizationId, actorId: user.id, proposalId: proposal.id, kind: "CREATED", summary: `Converted HVAC estimate to proposal "${proposal.title}"` },
  });

  revalidatePath("/dashboard/proposals");
  return { id: proposal.id };
}
