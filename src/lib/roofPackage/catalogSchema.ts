// The saved roof catalog's shape — validated on the way in and out of the
// RoofCatalog row. Kept out of catalog.ts so the zod import stays off the
// builder's client bundle path that only needs the constants.
import { z } from "zod";

export const roofSystemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  family: z.enum(["asphalt", "metal", "tile", "shake", "slate", "synthetic", "low-slope"]),
  matPerSq: z.number().min(0).max(100000),
  laborPerSq: z.number().min(0).max(100000),
  wastePct: z.number().min(0).max(50),
  capPerFt: z.number().min(0).max(10000),
});

export const underlaymentSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  perSq: z.number().min(0).max(100000),
});

export const roofCatalogSchema = z.object({
  version: z.literal(1),
  systems: z.array(roofSystemSchema).min(1).max(60),
  underlayments: z.array(underlaymentSchema).min(1).max(40),
  /** The builder's standing preferences — selections and unit prices — as it persists them. */
  prefs: z.record(z.string(), z.unknown()).default({}),
});

export type RoofCatalogDoc = z.infer<typeof roofCatalogSchema>;
