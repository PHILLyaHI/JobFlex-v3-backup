// What the fence estimator hands to convertFenceEstimateToProposal. Kept out
// of the "use server" file so the QA harness (scripts/qa/fence-convert-lines
// .check.ts) can validate the package engine's lines against the SAME rules
// the action applies — a line the engine can produce and the schema refuses
// is a conversion that fails in the field.
import { z } from "zod";

/** The 3D snapshot: a JPEG/WebP/PNG data URL, compressed on the client
 *  (fence-estimator-behavior captureModel) to stay well under Vercel's
 *  4.5 MB request cap. The server drops anything larger rather than failing. */
export const PREVIEW_MAX_CHARS = 1_500_000;

export const fenceConvertSchema = z.object({
  title: z.string().min(1).max(200),
  scope: z.string().optional(),
  materials: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().finite(),
      unitPrice: z.number().finite(),
      unit: z.string().optional(),
    }),
  ),
  labor: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().finite(),
      unitPrice: z.number().finite(),
      unit: z.string().optional(),
    }),
  ),
  assumptions: z.array(z.string()),
  // The package engine's lines (lib/fence/pricing, 2026-09-18): one row per
  // part of the job with its MATERIAL and LABOR halves per unit, so the
  // proposal can print both to the client and the org's markup lands on
  // each half. When present these are the proposal's lines; `materials` /
  // `labor` above stay for the older callers.
  lines: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(400).optional(),
        quantity: z.number().finite().min(0),
        unit: z.string().optional(),
        materialCost: z.number().finite().min(0),
        laborCost: z.number().finite().min(0),
      }),
    )
    .max(80)
    .optional(),
  // The job address: rides with the proposal and sets the state's sales tax.
  address: z.string().max(300).optional().nullable(),
  // Optional 3D snapshot (data URL) — uploaded to Blob and attached when present.
  previewDataUrl: z.string().optional(),
  // Pre-links the proposal to a client when converted from a client's page.
  clientId: z.string().optional().nullable(),
  inventoryLinked: z.boolean().optional().nullable(),
});

export type FenceConvertInput = z.infer<typeof fenceConvertSchema>;

/** The first thing wrong, as a person would say it: "lines.3.name: too short". */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  const path = issue.path.length ? issue.path.join(".") + ": " : "";
  return (path + issue.message).slice(0, 160);
}
