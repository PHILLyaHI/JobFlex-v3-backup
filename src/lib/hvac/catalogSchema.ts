// The catalog row's schema (2026-10-09) — shared by the estimator's typed-unit
// path (actions/hvacEstimator) and the catalog page's add / edit (actions/hvacCatalog).
// A "use server" module may export only async functions, so the schema lives here.
import { z } from "zod";

export const catalogItemSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["heat-pump", "air-conditioner", "furnace", "air-handler", "coil", "ductless", "package", "water-heater"]),
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  tons: z.number().min(0.4).max(25).optional(),
  coolingBtuh: z.number().min(0).max(400_000).optional(),
  heat47Btuh: z.number().min(0).max(400_000).optional(),
  heat17Btuh: z.number().min(0).max(400_000).optional(),
  heat5Btuh: z.number().min(0).max(400_000).optional(),
  btuInput: z.number().min(0).max(500_000).optional(),
  afue: z.number().min(0.5).max(1).optional(),
  seer2: z.number().min(5).max(45).optional(),
  eer2: z.number().min(5).max(30).optional(),
  hspf2: z.number().min(4).max(20).optional(),
  coldClimate: z.boolean().optional(),
  refrigerant: z.enum(["R-410A", "R-454B", "R-32", "R-22", "other"]).optional(),
  staging: z.enum(["single", "two-stage", "variable"]).optional(),
  ratedStaticInWc: z.number().min(0).max(2).optional(),
  mcaAmps: z.number().min(0).max(200).optional(),
  maxTons: z.number().min(0.5).max(25).optional(),
  gallons: z.number().min(10).max(200).optional(),
  whType: z.enum(["tank", "heat-pump", "tankless"]).optional(),
  fuel: z.enum(["gas", "electric", "propane"]).optional(),
  uef: z.number().min(0).max(6).optional(),
  vent: z.enum(["atmospheric", "power", "direct", "none"]).optional(),
  ahriRef: z.string().max(60).optional(),
  cost: z.number().min(0).max(200_000).optional(),
  tier: z.enum(["value", "mid", "premium"]).optional(),
  /** Gas rows: the NOx class the California districts read (14 = ultra-low). Dropping it turned a typed ULN furnace back into a 40 ng/J one on save. */
  noxNgJ: z.number().min(0).max(200).optional(),
  heatKind: z.enum(["gas", "electric", "heat-pump"]).optional(),
  firstHourGal: z.number().min(0).max(500).optional(),
  states: z.array(z.string().length(2)).max(60).optional(),
  notStates: z.array(z.string().length(2)).max(60).optional(),
  availabilityNote: z.string().max(240).optional(),
  verifiedOn: z.string().max(20).optional(),
  typed: z.literal(true).optional(),
  source: z.enum(["shop", "ahri", "neep", "manufacturer"]),
  family: z.string().max(60).optional(),
  offList: z.boolean().optional(),
  shopNote: z.string().max(240).optional(),
});

/** What the catalog page may change on a row: everything but its id and where it came from. */
export const catalogPatchSchema = catalogItemSchema.omit({ id: true, source: true, typed: true }).partial();
