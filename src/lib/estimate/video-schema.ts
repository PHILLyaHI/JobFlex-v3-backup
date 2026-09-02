import { z } from "zod";
import { clarifyQuestionSchema, type ClarifyQuestion } from "@/lib/estimatorSchema";

// VIDEO ESTIMATOR — the contract between the walkthrough analysis action
// (actions/videoEstimator.ts) and whatever renders it (the desktop blueprint
// page and the handheld build, through use-video-estimator.ts).
//
// Kept OUT of the "use server" file for the same reason estimatorSchema.ts is:
// a "use server" module may only export async functions, and both surfaces
// need the types and the brief composer on the client.
//
// WHAT THE ANALYSIS IS, AND IS NOT
// It is the READING of the video — what was built, what was said, what was
// measured, what is still unknown. It is deliberately not an estimate: pricing
// is the Smart Proposal pipeline's job (generateAdvancedEstimate and friends),
// and this module's `briefFromAnalysis` is the seam between the two. One
// pricing engine for every intake, so a fence walked on video and a fence typed
// into the brief price the same way.

const trimmedOpt = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : undefined;
  });

/** The project types the pricing pipeline already knows (advanced-ai-data
 *  PROJECT_TYPES). The analysis picks one so the planner prompt sees a
 *  vocabulary it was tuned on. */
export const VIDEO_PROJECT_TYPES = ["roof", "fence", "deck", "siding", "gutters", "other"] as const;
export type VideoProjectType = (typeof VIDEO_PROJECT_TYPES)[number];

export const measurementSchema = z.object({
  /** "Fence run", "Wall height", "Gates". */
  label: z.string().min(1).max(80),
  /** Free text so feet-and-inches survive: "128", "6'0\"", "2". */
  value: z.string().min(1).max(40),
  unit: trimmedOpt,
  /** How well the video supports the number. */
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  /** spoken = said on the audio track (ground truth); visual = read off a frame
   *  against a reference object; inferred = deduced from context. */
  source: z.enum(["spoken", "visual", "inferred"]).default("visual"),
});
export type WalkthroughMeasurement = z.infer<typeof measurementSchema>;

export const walkthroughAnalysisSchema = z.object({
  projectType: z.enum(VIDEO_PROJECT_TYPES).default("other"),
  /** A job title a contractor would write: "Cedar privacy fence — backyard". */
  title: z.string().min(1).max(160),
  /** "City, ST" when spoken, visible or given on the ticket; otherwise null. */
  location: z.string().max(120).nullable().default(null),
  /** The brief the material planner prices — what, how much, what with, what
   *  condition, what access. 3–8 sentences. */
  scope: z.string().min(1).max(4000),
  measurements: z.array(measurementSchema).max(16).default([]),
  /** Site conditions, existing materials, damage, obstacles, access. */
  observations: z.array(z.string().max(240)).max(16).default([]),
  /** The frames that carry the evidence, captioned. `index` is into the frame
   *  list the client sent, so the UI can show the actual picture. */
  frames: z
    .array(z.object({ index: z.number().int().min(0), label: z.string().min(1).max(80) }))
    .max(8)
    .default([]),
  /** The intake gate, same shape as the Smart Proposal's. */
  enoughDetail: z.boolean().default(true),
  questions: z.array(clarifyQuestionSchema).max(8).default([]),
  /** 0–100: how well the video supports a priced estimate. */
  confidence: z.number().min(0).max(100).default(50),
  /** Short quotes from the transcript that change the estimate. */
  transcriptHighlights: z.array(z.string().max(240)).max(10).default([]),
});
export type WalkthroughAnalysis = z.infer<typeof walkthroughAnalysisSchema>;

// ── What the action accepts ─────────────────────────────────────────────────
// Frames are JPEG data URLs pulled in the BROWSER (video-ingest.ts), so the
// video itself never uploads: 14 frames at 960px is ~2MB, a 5-minute clip is
// 200MB. The transcript is the browser's chunked Whisper pass, re-joined.

/** Per-frame cap: a 960px JPEG at q0.72 is ~100–200KB, i.e. ~270K base64 chars. */
export const FRAME_MAX_CHARS = 1_500_000;
export const FRAME_MAX_COUNT = 16;

export const walkthroughInputSchema = z.object({
  frames: z
    .array(
      z.object({
        /** Seconds into the clip. */
        t: z.number().min(0),
        dataUrl: z.string().max(FRAME_MAX_CHARS),
      }),
    )
    .min(1)
    .max(FRAME_MAX_COUNT),
  /** The joined transcript, `[mm:ss] text` per line. Empty when there is no audio. */
  transcript: z.string().max(24_000).default(""),
  audioState: z.enum(["ok", "none", "failed"]).default("none"),
  /** Clip length in seconds. */
  duration: z.number().min(0).max(3600),
  /** The three ticket fields, as typed. All optional — the video is the brief. */
  project: z.string().max(200).default(""),
  address: z.string().max(300).default(""),
  notes: z.string().max(4000).default(""),
});
export type WalkthroughInput = z.infer<typeof walkthroughInputSchema>;

// ── The seam into the pricing pipeline ──────────────────────────────────────

/** The transcript line prefix. Whisper segments are re-joined with these so the
 *  model can tie a sentence to the frame it was said over. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function measurementLine(m: WalkthroughMeasurement): string {
  const unit = m.unit ? ` ${m.unit}` : "";
  return `- ${m.label}: ${m.value}${unit} (${m.source}, ${m.confidence} confidence)`;
}

/**
 * Compose the brief `generateAdvancedEstimate` reads from the analysis.
 *
 * This is the ONE place the two pipelines meet, so both surfaces must build it
 * here — the same walkthrough has to price the same on a phone as on a desk.
 * Measurements go in as a labelled block with their confidence, so the planner
 * can treat a spoken "128 ft" as fact and a visual "about 6 ft" as a figure to
 * confirm; observations carry the site conditions the description alone would
 * lose; the contractor's typed notes ride last, as instructions.
 */
export function briefFromAnalysis(a: WalkthroughAnalysis, notes: string): string {
  const parts: string[] = [a.scope.trim()];
  if (a.measurements.length) {
    parts.push(`Measured from the walkthrough:\n${a.measurements.map(measurementLine).join("\n")}`);
  }
  if (a.observations.length) {
    parts.push(`Site observations:\n${a.observations.map((o) => `- ${o}`).join("\n")}`);
  }
  if (a.transcriptHighlights.length) {
    parts.push(
      `Said on the walkthrough:\n${a.transcriptHighlights.map((q) => `- "${q}"`).join("\n")}`,
    );
  }
  const n = notes.trim();
  if (n) parts.push(`Contractor notes: ${n}`);
  return parts.join("\n\n");
}

/** The open questions the contractor left unanswered, as assumption text. */
export function openQuestionsAsAssumptions(qs: ClarifyQuestion[]): string[] {
  return qs.map((q) => `Not confirmed: ${q.question}`);
}
