// The organization's fence catalog document — the shop's price book, its
// own fence types and its standing options — validated on the way in and
// out of FenceCatalog.catalogJson (and the browser's mirror).

import { z } from "zod";
import { FENCE_TYPES } from "./catalog";
import { RATE_LIMITS } from "./rates";

const typeIds = FENCE_TYPES.map((t) => t.id) as [string, ...string[]];

const rate = (f: keyof typeof RATE_LIMITS) => z.number().finite().min(RATE_LIMITS[f].min).max(RATE_LIMITS[f].max).optional();

export const fenceRateSchema = z.object({
  materialPerLf: rate("materialPerLf"),
  laborPerLf: rate("laborPerLf"),
  gateSingle: rate("gateSingle"),
});

export const customFenceTypeSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  like: z.enum(typeIds),
  materialPerLf: z.number().finite().min(RATE_LIMITS.materialPerLf.min).max(RATE_LIMITS.materialPerLf.max),
  laborPerLf: z.number().finite().min(RATE_LIMITS.laborPerLf.min).max(RATE_LIMITS.laborPerLf.max),
  gateSingle: z.number().finite().min(RATE_LIMITS.gateSingle.min).max(RATE_LIMITS.gateSingle.max).optional(),
  color: z.string().max(16).optional(),
});

export const fenceCatalogSchema = z.object({
  version: z.literal(1),
  /** Sparse per-type overrides; a type absent here prices at the catalog's rate. */
  rates: z.record(z.string(), fenceRateSchema).default({}),
  /** The shop's own types. */
  custom: z.array(customFenceTypeSchema).max(40).default([]),
  /** The shop's tear-out rate, $/LF. */
  removalPerLf: z.number().finite().min(0).max(200).optional(),
  /** Waste on cut goods, percent. */
  wastePct: z.number().finite().min(0).max(30).optional(),
});

export type FenceCatalogDoc = z.infer<typeof fenceCatalogSchema>;

export const EMPTY_FENCE_CATALOG: FenceCatalogDoc = { version: 1, rates: {}, custom: [] };
