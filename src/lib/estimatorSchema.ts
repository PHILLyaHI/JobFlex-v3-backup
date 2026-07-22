import { z } from "zod";

// Shared estimator schema/types. Kept OUT of the "use server" action files
// (advancedEstimator/roofEstimator/fenceEstimator) because a "use server" file
// may only export async functions — exporting a Zod object from one throws
// "A 'use server' file can only export async functions, found object."

// Accept only http(s) URLs from the (untrusted) model + SerpAPI output. Coerce
// anything else (javascript:, data:, malformed) to undefined so a hostile or
// hallucinated scheme can never persist and later render into an href/src.
const httpUrl = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t && /^https?:\/\//i.test(t) ? t : undefined;
  });

// Free-text optional: blank / whitespace-only normalizes to undefined so it
// never renders an empty meta chip (mirrors the httpUrl hygiene).
const trimmedOpt = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

export const lineSchema = z.object({
  // Client row identity, passed through the AI round-trip. Lets the refine
  // match lines by identity (not name), so a rename never re-shops/re-prices.
  // The model echoes it; brand-new lines omit it. Optional for back-compat.
  id: z.string().optional(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  unit: trimmedOpt,
  // Product metadata surfaced by the live-pricing estimator so the purchases
  // page can render a real shoppable line (store, link, image, size, math notes).
  store: trimmedOpt,
  productUrl: httpUrl,
  imageUrl: httpUrl,
  dimensions: trimmedOpt,
  notes: trimmedOpt,
});

// One order-level discount, mirroring the Prisma Discount row on Proposal
// ({label, amount, isPercent}) so it converts 1:1. amount is dollars when
// isPercent=false, a 0-100 percentage when true.
export const discountSchema = z.object({
  label: z.string().min(1).max(80),
  amount: z.number().positive(),
  isPercent: z.boolean(),
});
export type EstimateDiscount = z.infer<typeof discountSchema>;

export const estimateSchema = z.object({
  title: z.string(),
  scope: z.string(),
  assumptions: z.array(z.string()).default([]),
  materials: z.array(lineSchema).default([]),
  labor: z.array(lineSchema).default([]),
  estimatedTimelineDays: z.number().optional(),
  // Set by the refine when the contractor asks for a discount ("10% off",
  // "knock $500 off") — kept order-level instead of mangled into line prices.
  discount: discountSchema.nullish(),
});

export type GeneratedEstimate = z.infer<typeof estimateSchema>;

// ── Prompt analysis (intake gate) ───────────────────────────────────────────
// Before generating, the AI checks the brief is descriptive enough and corrects
// the location. If thin, it returns 3-8 targeted clarifying questions.
export const clarifyQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  kind: z.enum(["select", "number", "text"]).default("text"),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
  placeholder: z.string().optional(),
});

export const promptAnalysisSchema = z.object({
  /** Normalized "City, ST", or null when none/invalid. */
  correctedLocation: z.string().nullable().default(null),
  enoughDetail: z.boolean().default(true),
  questions: z.array(clarifyQuestionSchema).default([]),
});

export type ClarifyQuestion = z.infer<typeof clarifyQuestionSchema>;
export type PromptAnalysis = z.infer<typeof promptAnalysisSchema>;
