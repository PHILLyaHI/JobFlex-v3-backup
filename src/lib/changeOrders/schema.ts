// Server-side validation for what the change-order sheet sends. Kept out of
// the "use server" action file (a "use server" module may only export async
// functions) and out of types.ts (no zod on the client bundle).
import { z } from "zod";

export const coLineSchema = z.object({
  key: z.string().min(1).max(60),
  name: z.string().min(1).max(160),
  quantity: z.number().finite().min(0).max(1_000_000),
  unit: z.enum(["sq ft", "linear ft", "square", "each", "hour", "lot"]),
  unitPrice: z.number().finite().min(-1_000_000).max(1_000_000),
  kind: z.enum(["material", "labor"]),
  meta: z.record(z.string(), z.union([z.string().max(120), z.number()])).optional(),
});

export const coPhotoSchema = z.object({
  id: z.string().min(1).max(64),
  url: z.string().url().max(2048),
  caption: z.string().max(160).optional(),
});

export const createChangeOrderSchema = z
  .object({
    jobId: z.string().optional(),
    proposalId: z.string().optional(),
    kind: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    reason: z.string().max(2000).optional().nullable(),
    lines: z.array(coLineSchema).min(1).max(60),
    photos: z.array(coPhotoSchema).max(12).default([]),
    taxable: z.boolean().default(true),
    send: z.boolean().default(false),
    /** Prices to remember for next time: item key → unit price and last quantity. */
    remember: z
      .array(z.object({ itemKey: z.string().min(1).max(60), unitPrice: z.number().finite().min(0), lastQuantity: z.number().finite().min(0).optional() }))
      .max(20)
      .default([]),
  })
  .refine((d) => Boolean(d.jobId) || Boolean(d.proposalId), { message: "A change order needs a job or a proposal." });

export type CreateChangeOrderInput = z.infer<typeof createChangeOrderSchema>;

export const respondSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  agree: z.boolean().optional(),
  reason: z.string().trim().max(2000).optional(),
});
