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

const planPoint = z.object({ x: z.number().finite(), y: z.number().finite(), gap: z.boolean().optional() });

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
  // The traced layout (2026-09-23): kept with the proposal as an ActivityEvent
  // (FENCE_PLAN) and drawn for the client's page (lib/fence/planSvg). Local
  // feet about the address pin, like the estimator's own trace.
  plan: z
    .object({
      points: z.array(planPoint).min(2).max(600),
      gates: z.array(z.object({ segmentIndex: z.number().int().min(0).max(600), t: z.number().min(0).max(1), widthFt: z.number().min(0).max(40), kind: z.enum(["gate", "door"]), label: z.string().max(60).optional(), x: z.number().finite().optional(), y: z.number().finite().optional() })).max(40),
      buildings: z.array(z.object({ ring: z.array(planPoint).min(3).max(300), role: z.enum(["subject", "neighbor"]) })).max(40),
      lots: z.array(z.array(planPoint).min(3).max(400)).max(10),
      origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
      heightFt: z.number().min(0).max(20),
      typeLabel: z.string().max(120),
      totalLf: z.number().min(0).max(100_000),
      address: z.string().max(300).nullable(),
    })
    .optional(),
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
