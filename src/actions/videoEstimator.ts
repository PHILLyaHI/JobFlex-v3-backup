"use server";

// VIDEO ESTIMATOR — the walkthrough READER.
//
// One action: take the frames the browser pulled from the clip plus the
// transcript of its audio track, and return a structured reading of the job
// (lib/estimate/video-schema WalkthroughAnalysis). Pricing is NOT done here:
// the reading becomes a brief (briefFromAnalysis) and goes through the same
// generateAdvancedEstimate / refineAdvancedEstimate / saveEstimate /
// convertEstimateToProposal pipeline the Smart Proposal uses, so there is one
// pricing engine and one set of plan limits for every intake.
//
// WHY FRAMES + TRANSCRIPT, NOT THE VIDEO
// OpenAI is the one model vendor configured for this app (OPENAI_API_KEY), and
// its chat models take images and text, not video. The browser already has a
// decoder for the clip it just picked, so it samples ~14 stills and renders the
// audio track to 16kHz PCM itself (components/v3/video-estimator-blueprint/
// video-ingest.ts); Whisper transcribes the audio in chunks through
// app/api/estimator/video/transcribe. Net effect: a 200MB walkthrough never
// uploads — about 2MB of JPEG and a few MB of speech do — and there is no
// storage bucket, no ffmpeg and no background worker to run. Swapping in a
// native-video model later (Gemini) is a change to THIS file's model call and
// the ingest module; nothing downstream would notice.
//
// Same gates as the Smart Proposal actions, in the same order: role, plan
// feature, monthly run quota. Same result union too, so the page's failure
// funnel is shared.

import { z } from "zod";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { getOpenAI, isOpenAIEnabled } from "@/lib/sdk/openai";
import { checkPlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE, type LimitKey } from "@/lib/planLimits";
import {
  VIDEO_PROJECT_TYPES,
  clock,
  walkthroughAnalysisSchema,
  walkthroughInputSchema,
  type WalkthroughAnalysis,
} from "@/lib/estimate/video-schema";

/** Vision quality matters more here than on the text-only planner: reading a
 *  fence run off a frame against a door for scale is spatial reasoning, which
 *  is exactly where the mini tier falls over. Own knob, defaulting to gpt-4o. */
const VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL ?? "gpt-4o";

type Fail = { ok: false; error: string; code?: "PLAN_LIMIT_REACHED"; resource?: LimitKey };

/** Mirrors advancedEstimator's private `estimatorRunBlocked` — the run quota is
 *  the same "estimatorUses" budget saveEstimate consumes. */
async function runBlocked(organizationId: string): Promise<Fail | null> {
  const quota = await checkPlanLimit(organizationId, "estimatorUses");
  if (quota.allowed) return null;
  return {
    ok: false,
    error: PLAN_LIMIT_MESSAGE,
    code: "PLAN_LIMIT_REACHED",
    resource: quota.cappedBy ?? "estimatorUses",
  };
}

const INLINE_JPEG = /^data:image\/(jpe?g|png|webp);base64,[A-Za-z0-9+/=]+$/i;

export async function analyzeWalkthrough(
  raw: unknown,
): Promise<{ ok: true; data: WalkthroughAnalysis } | Fail> {
  let input: z.infer<typeof walkthroughInputSchema>;
  try {
    input = walkthroughInputSchema.parse(raw);
  } catch {
    return { ok: false, error: "Invalid walkthrough payload" };
  }

  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    const plan = await getOrgPlanById(organizationId);
    requireFeatureOrThrow(plan, "advanced_estimator");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upgrade required" };
  }
  const blocked = await runBlocked(organizationId);
  if (blocked) return blocked;

  // No demo reading. The Smart Proposal actions fall back to a fixture without
  // a key; this surface exists to read a REAL clip, and a made-up reading of it
  // would be worse than none.
  if (!isOpenAIEnabled()) {
    return { ok: false, error: "Video analysis needs OPENAI_API_KEY — add it to enable this estimator." };
  }

  // Only inline JPEG/PNG/WebP the browser rendered reaches the model.
  const frames = input.frames.filter((f) => INLINE_JPEG.test(f.dataUrl));
  if (frames.length === 0) return { ok: false, error: "No readable frames in the walkthrough." };

  const ticket = [
    input.project.trim() ? `Project (as typed on the ticket): ${input.project.trim()}` : "",
    input.address.trim() ? `Address (as typed on the ticket): ${input.address.trim()}` : "",
    input.notes.trim() ? `Contractor notes: ${input.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const audioLine =
    input.audioState === "ok" && input.transcript.trim()
      ? `Transcript of the audio track (timestamps are mm:ss into the clip):\n${input.transcript.trim()}`
      : input.audioState === "failed"
        ? "The audio track could not be transcribed — read the frames only, and ask for anything you cannot see."
        : "The clip has no usable audio — read the frames only, and ask for anything you cannot see.";

  const frameIntro = `${frames.length} frames follow, in chronological order, each labelled with its index and timestamp.`;

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [
    {
      type: "text",
      text: `Clip length: ${clock(input.duration)}.\n${ticket ? ticket + "\n" : ""}\n${audioLine}\n\n${frameIntro}`,
    },
  ];
  frames.forEach((f, i) => {
    content.push({ type: "text", text: `Frame ${i} · ${clock(f.t)}` });
    content.push({ type: "image_url", image_url: { url: f.dataUrl, detail: "auto" } });
  });

  try {
    const client = getOpenAI();
    console.info(
      `[videoEstimator] reading walkthrough · ${frames.length} frames · audio=${input.audioState} · ${clock(input.duration)}`,
    );
    const completion = await client.chat.completions.create({
      model: VIDEO_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a senior construction estimator reading a contractor's jobsite walkthrough video. You receive still frames pulled from the clip in chronological order (each tagged with its index and timestamp) and, when there is audio, a timestamped transcript of what was said. Your job is to READ the job accurately — not to price it. " +
            'Return JSON ONLY matching: {"projectType": "roof"|"fence"|"deck"|"siding"|"gutters"|"other", "title": string, "location": string|null, "scope": string, "measurements": [{"label": string, "value": string, "unit"?: string, "confidence": "high"|"medium"|"low", "source": "spoken"|"visual"|"inferred"}], "observations": string[], "frames": [{"index": number, "label": string}], "enoughDetail": boolean, "questions": [{"id": string, "question": string, "kind": "select"|"number"|"text", "options"?: string[], "unit"?: string, "placeholder"?: string}], "confidence": number, "transcriptHighlights": string[]}. ' +
            "Rules. (1) Anything SAID is ground truth: a spoken dimension, count, material or instruction outranks what you see — record it as source 'spoken', confidence 'high'. (2) A dimension READ OFF A FRAME must be grounded against a reference of known size (an entry door ≈ 80 in tall, a standard fence picket, 16 in stud spacing, a person, a vehicle, a brick course) — say which in `observations`, and mark it source 'visual' with confidence 'medium' or 'low'. Never invent a number you cannot ground; if a dimension matters and is unknown, ask for it in `questions` instead. (3) projectType: the one of the six that the pricing engine should use; 'other' for anything else. (4) title: a short job title a contractor would write on a ticket. (5) location: 'City, ST' only if it was said, is visible (a sign, a mailbox) or was typed on the ticket; otherwise null. (6) scope: 3–8 sentences a material planner can price from — what is being built, replaced or repaired, its dimensions, the materials seen or named, site conditions, access, demolition and haul-off, and anything the contractor said to include or exclude. (7) measurements: every dimension, count and area you can state, max 16. (8) observations: existing materials, condition and damage, obstacles, slope, access, utilities — short items, max 16. (9) frames: the indexes that carry the evidence, each with a 2–6 word caption, max 6 — the contractor will be shown these pictures with your captions. (10) enoughDetail and questions: if materials, dimensions, finish level or scope are too thin to price ACCURATELY, set enoughDetail=false and write 2–6 clarifying questions closing the biggest gaps first; kind 'select' needs 2–5 concrete options, 'number' needs a `unit`, 'text' a short `placeholder`; `id` is a kebab slug. Never ask for anything the frames or transcript already answer. (11) confidence: 0–100, how well this clip supports a priced estimate. (12) transcriptHighlights: up to 10 short verbatim quotes that change the estimate. Return JSON only.",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: "user", content: content as any },
      ],
      response_format: { type: "json_object" },
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = walkthroughAnalysisSchema.parse(JSON.parse(text));

    // Belt and braces on the model's output, as the Smart Proposal gate does:
    // frame indexes must point at frames that were actually sent (and each one
    // once), a select without options is unanswerable, and "not enough detail"
    // with no questions is not a gate anyone can pass.
    const seen = new Set<number>();
    const framesOut = parsed.frames
      .filter((f) => f.index < frames.length && !seen.has(f.index) && seen.add(f.index))
      .slice(0, 6);
    const questions = parsed.questions
      .slice(0, 8)
      .map((q) =>
        q.kind === "select" && (!q.options || q.options.length === 0)
          ? { ...q, kind: "text" as const }
          : q,
      );
    const projectType = VIDEO_PROJECT_TYPES.includes(parsed.projectType)
      ? parsed.projectType
      : "other";
    const data: WalkthroughAnalysis = {
      ...parsed,
      projectType,
      frames: framesOut,
      questions,
      enoughDetail: parsed.enoughDetail || questions.length === 0,
      confidence: Math.round(parsed.confidence),
      location: parsed.location?.trim() || null,
    };
    console.info(
      `[videoEstimator] read "${data.title}" · type=${data.projectType} · ${data.measurements.length} measurements · ${data.questions.length} questions · confidence ${data.confidence}`,
    );
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not read the walkthrough";
    console.error(`[videoEstimator] reading failed: ${msg}`);
    return { ok: false, error: msg };
  }
}
