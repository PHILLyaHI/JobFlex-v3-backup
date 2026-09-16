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
import { geocodePlace } from "@/lib/maps";
import { elevationForPoints } from "@/lib/elevationProfile";
import { fetchPropertyBoundary } from "@/actions/fenceBoundary";
import { runVisionJson } from "@/lib/sdk/openaiVision";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { stateFromAddress } from "@/lib/pricing/salesTax";
import type { CatalogItem } from "@/lib/hvac/types";
import { pickBuilding, ringGeometry, storeysFromHeight } from "@/lib/hvac/site";
import type { SiteFacts, NameplateRead } from "@/lib/hvac/intake";
import { DEFAULT_RATE_CARD, STARTER_CATALOG, parseCatalogCsv, type HvacRateCard } from "@/lib/hvac/ledger";

type Fail = { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey };

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

  // 1 · county + point, from Google when the browser had no pin or no county.
  if (!facts.county || facts.lat === undefined || facts.lng === undefined || !facts.state) {
    const g = await geocodePlace(facts.address);
    if (g) {
      if (facts.lat === undefined || facts.lng === undefined) { facts.lat = g.lat; facts.lng = g.lng; }
      if (!facts.county && g.county) { facts.county = g.county; facts.sources.county = "Google geocoder"; }
      if (!facts.state && g.state) facts.state = g.state.toUpperCase();
    } else if (!facts.county) {
      warnings.push("County lookup is off on this server — pick the county so the design temperatures are the county's, not the state median.");
    }
  } else if (facts.county) {
    facts.sources.county = "picked";
  }
  if (!facts.state) return { ok: false, error: "Couldn't tell the state from that address — add the state (e.g. TX)." };

  if (facts.lat === undefined || facts.lng === undefined) {
    warnings.push("No map point for this address — footprint and elevation skipped. Pick the address from the suggestions to get them.");
    return { ok: true, facts, warnings };
  }

  // 2 · the footprint the pin is in (parcel + buildings), and 3 · elevation —
  // independent; a failure in one leaves the other alone.
  const [site, elev] = await Promise.all([
    fetchPropertyBoundary(facts.lat, facts.lng).catch(() => null),
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
        facts.sources.footprint = pick.inside ? "building footprint at the pin" : "nearest building footprint — confirm it is the house";
        if (!pick.inside) warnings.push("The pin is not inside a building footprint; the nearest one was used. Confirm the area.");
        const storeys = storeysFromHeight(pick.building.heightFt);
        if (storeys) {
          facts.storeys = storeys;
          facts.sources.storeys = `building height ${Math.round(pick.building.heightFt ?? 0)} ft on the footprint record`;
        }
      }
    } else {
      warnings.push("No building footprint found here — enter the conditioned area.");
    }
    if (!site.ok && site.error && !/REPORTALL_CLIENT_KEY/.test(site.error)) warnings.push(site.error);
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

export async function importHvacCatalogCsv(raw: unknown): Promise<{ ok: true; imported: number; errors: string[] } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  const parsed = z.object({ csv: z.string().max(2_000_000), replace: z.boolean().default(false) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid import payload" };
  const { items, errors } = parseCatalogCsv(parsed.data.csv);
  if (!items.length) return { ok: false, error: errors[0] ?? "No rows to import." };
  try {
    if (parsed.data.replace) await db.hvacCatalogItem.deleteMany({ where: { organizationId } });
    for (const item of items) {
      await db.hvacCatalogItem.upsert({
        where: { organizationId_itemId: { organizationId, itemId: item.id } },
        create: { organizationId, itemId: item.id, kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) },
        update: { kind: item.kind, brand: item.brand, model: item.model, itemJson: JSON.stringify(item) },
      });
    }
    return { ok: true, imported: items.length, errors };
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

export interface HvacEstimateSummary {
  id: string;
  address: string;
  status: string;
  subtotal: number;
  createdAt: string;
  title: string;
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
    const rows = await db.hvacEstimate.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, address: true, status: true, subtotal: true, createdAt: true, draftJson: true } });
    return rows.map((r) => {
      let title = "";
      try { title = String((JSON.parse(r.draftJson) as { title?: string }).title ?? ""); } catch { /* keep empty */ }
      return { id: r.id, address: r.address, status: r.status, subtotal: r.subtotal, createdAt: r.createdAt.toISOString(), title };
    });
  } catch {
    return [];
  }
}

export async function getHvacEstimate(id: string): Promise<{ ok: true; row: { id: string; address: string; status: string; siteFacts: unknown; model: unknown; engine: unknown; draft: z.infer<typeof draftSchema>; proposalId: string | null } } | { ok: false; error: string }> {
  const { organizationId } = await requireEstimatorOrManager();
  try {
    const r = await db.hvacEstimate.findFirst({ where: { id, organizationId } });
    if (!r) return { ok: false, error: "That estimate isn't here any more." };
    const draft = draftSchema.safeParse(JSON.parse(r.draftJson));
    if (!draft.success) return { ok: false, error: "That estimate's draft no longer validates." };
    return { ok: true, row: { id: r.id, address: r.address, status: r.status, siteFacts: JSON.parse(r.siteFactsJson), model: JSON.parse(r.modelJson), engine: JSON.parse(r.engineJson), draft: draft.data, proposalId: r.proposalId } };
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
      scopeOfWork: data.scope ?? "",
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
