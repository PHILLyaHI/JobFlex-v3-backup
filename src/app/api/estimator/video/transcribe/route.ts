// VIDEO ESTIMATOR — one chunk of the audio track, transcribed.
//
// The browser renders the clip's audio to 16kHz mono PCM and posts it here in
// ≤100-second WAV chunks (components/v3/video-estimator-blueprint/video-ingest
// .ts); each chunk comes back as timestamped segments, offset to its place in
// the clip, and the client re-joins them. Chunked because a Vercel function
// accepts at most 4.5MB per request and 100s of 16-bit 16kHz mono is 3.2MB —
// a 5-minute walkthrough is three or four of these, run in parallel.
//
// A route handler, not a server action, because server actions serialise a
// Blob through the RSC payload; a multipart body is what a file upload is for.
// It carries its own auth — the middleware matches /dashboard and /admin only.

import { NextResponse } from "next/server";
import { toFile } from "openai";
import { requireEstimatorOrManager } from "@/lib/orgContext";
import { getOpenAI, isOpenAIEnabled } from "@/lib/sdk/openai";
import { checkPlanLimit } from "@/lib/limitsEngine";
import { PLAN_LIMIT_MESSAGE } from "@/lib/planLimits";
import { rateLimitShared, HOUR } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Below Vercel's 4.5MB request cap, with room for the multipart envelope. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Biases the decoder toward the vocabulary it will hear. It is NOT a
 *  transcript of anything — Whisper treats it as style, not content. */
const DECODER_PROMPT =
  "Contractor walkthrough of a jobsite. Measurements in feet and inches, e.g. 128 feet, 6 foot, 2 by 4, 5/4 deck board, cedar, pressure treated.";

/** Whisper's own decoder treats this as a failed decode; the API hands us the
 *  ratio but applies no threshold of its own. A looped hallucination
 *  ("5 by 4, 5 by 4, 5 by 4, …") compresses far better than speech does. */
const MAX_COMPRESSION_RATIO = 2.4;

/** Lower-case, punctuation-free word list — the shape both the echo guard and
 *  its n-grams are built from. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function ngrams(list: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= list.length; i++) out.add(list.slice(i, i + n).join(" "));
  return out;
}

/** The prompt's own 5-word runs. Built once. */
const PROMPT_GRAMS = ngrams(words(DECODER_PROMPT), 5);

/**
 * ON SILENCE, WHISPER SAYS THE PROMPT BACK.
 *
 * Given a clip with music or room tone and no speech, it returns the biasing
 * prompt almost verbatim — an eight-second ad came back as "Measurements in
 * feet and inches, e.g. 112 feet, 6 foot, 2 by 4, 5 by 4, 5 by 4, …", which
 * then reached the reader as something the contractor had said and produced a
 * clarify question about "the '5 by 4' measurements". `no_speech_prob` did not
 * catch it: the model was confident, it was simply confidently wrong.
 *
 * The test is a shared FIVE-word run with the prompt. An echo reproduces the
 * prompt's own phrasing; real speech about a jobsite shares its vocabulary
 * ("feet", "cedar", "pressure treated") but not five consecutive words of it,
 * which is why this is a 5-gram test and not a word-overlap score — the latter
 * throws away the genuine "128 feet, 6 foot cedar, pressure treated posts"
 * along with the fake.
 */
function isPromptEcho(text: string): boolean {
  const grams = ngrams(words(text), 5);
  for (const g of grams) if (PROMPT_GRAMS.has(g)) return true;
  return false;
}

export async function POST(req: Request) {
  let organizationId: string;
  try {
    ({ organizationId } = await requireEstimatorOrManager());
    const { requireFeatureOrThrow } = await import("@/lib/entitlements");
    const { getOrgPlanById } = await import("@/lib/orgPlan");
    requireFeatureOrThrow(await getOrgPlanById(organizationId), "advanced_estimator");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 403 });
  }
  const quota = await checkPlanLimit(organizationId, "estimatorUses");
  // Whisper is billed per second of audio: hard per-org ceiling independent of
  // the plan meter (which only counts SAVED estimates).
  const gate = await rateLimitShared(`transcribe:${organizationId}`, 40, HOUR);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  if (!quota.allowed) {
    return NextResponse.json(
      { error: PLAN_LIMIT_MESSAGE, code: "PLAN_LIMIT_REACHED", resource: quota.cappedBy ?? "estimatorUses" },
      { status: 402 },
    );
  }
  if (!isOpenAIEnabled()) {
    return NextResponse.json({ error: "Transcription needs OPENAI_API_KEY." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio chunk" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio chunk too large" }, { status: 413 });
  }
  const offset = Math.max(0, Number(form.get("offset") ?? 0) || 0);

  try {
    const client = getOpenAI();
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), "walkthrough.wav", {
      type: "audio/wav",
    });
    const res = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      prompt: DECODER_PROMPT,
    });
    // Whisper HALLUCINATES on non-speech: a 440Hz test tone came back as "For
    // more information visit www.FEMA.gov". It also reports, per segment, how
    // sure it was that anyone was speaking — so a segment it flags as probably
    // not speech, or decoded with very low confidence, is dropped here rather
    // than fed to the reader as something the contractor said.
    const segments = (res.segments ?? [])
      .filter(
        (s) =>
          s.no_speech_prob < 0.6 &&
          s.avg_logprob > -1.2 &&
          s.compression_ratio < MAX_COMPRESSION_RATIO &&
          !isPromptEcho(s.text),
      )
      .map((s) => ({
        start: s.start + offset,
        end: s.end + offset,
        text: s.text.trim(),
      }))
      .filter((s) => s.text);
    return NextResponse.json({ text: segments.map((s) => s.text).join(" "), segments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transcription failed";
    console.error(`[videoEstimator] transcription failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
