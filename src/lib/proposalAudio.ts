// THE SPOKEN PROPOSAL — MADE, KEPT AND SERVED (2026-09-23). Server only.
//
// The words come from lib/proposalSpeech (pure). This module turns them into
// an MP3 with OpenAI's speech model, keeps the file in Blob, and remembers
// on the proposal row which script the file was read from. Two callers:
//   - sendProposal warms the audio when the proposal goes out, so the
//     client's first tap plays at once instead of waiting on a voice model
//     in a moving car;
//   - /api/public-quote/[publicId]/audio serves it, and makes it on demand
//     for proposals sent before this existed, a warm-up that timed out, and
//     any price change after sending — the cache key is the hash of the
//     script, so a discount or an approved change order moves the hash and
//     the next play is read again with the new numbers.
// The MP3 lives in the database (ProposalAudio, one row per proposal) and is
// served by /api/public-quote/[publicId]/audio/file: production has no Blob
// store (2026-09-24 — every play there was the phone's own voice), and a
// forty-second file is a few hundred kilobytes. Without an OpenAI key there
// is no file: the route hands the script to the browser, which reads it
// with the device's own voice.

import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled } from "@/lib/sdk/openai";
import { buildProposalSpeech, speechHash, speechInputFromRow, speechSeconds, type SpeechRowLike } from "@/lib/proposalSpeech";

// THE VOICE (owner, 2026-09-24: "one level voice, no spaces — I need a better
// girl speaking"). The steerable speech model with OpenAI's most natural
// female voice and a delivery brief; the script's paragraph breaks are the
// pauses. A project key that is not entitled to the model answers
// model_not_found, and the HD classic model is next — never the flat tts-1
// unless nothing else answers. The file's name carries which one read it.
const TTS_INSTRUCTIONS =
  "Voice: a warm, friendly woman from the contractor's front office — confident, easygoing and genuinely helpful, " +
  "like leaving a friendly voicemail for a customer. " +
  "Pacing: conversational and unhurried, about 150 words a minute. Take a clear pause at every paragraph break, " +
  "and a short breath before each dollar amount. " +
  "Delivery: read dollar amounts slowly and clearly; read the phone digits one at a time, in their groups. " +
  "Natural rises and falls, a smile in the voice — never flat, never robotic, never salesy.";
const TTS_CANDIDATES: Array<{ model: string; voice: string; instructions?: string }> = [
  { model: "gpt-4o-mini-tts", voice: "marin", instructions: TTS_INSTRUCTIONS },
  { model: "gpt-4o-mini-tts", voice: "coral", instructions: TTS_INSTRUCTIONS },
  { model: "tts-1-hd", voice: "nova" },
  { model: "tts-1", voice: "nova" },
];

/** What the loader selects — the speech input plus the cache columns. */
export const AUDIO_INCLUDE = {
  lineItems: { orderBy: { position: "asc" as const }, select: { name: true, quantity: true, measurementType: true, total: true } },
  installments: { orderBy: { position: "asc" as const }, select: { label: true, amount: true, isPercent: true, status: true, paidAmount: true } },
  changeOrders: { where: { status: "APPROVED" }, select: { status: true, total: true } },
  client: { select: { name: true, address: true } },
  organization: { select: { name: true, phone: true, deletedAt: true } },
};

export type AudioRow = SpeechRowLike & {
  id: string;
  publicId: string;
  organizationId: string;
  clientId: string | null;
  audioUrl: string | null;
  audioScriptHash: string | null;
  organization: { name: string | null; phone: string | null; deletedAt: Date | null };
};

export async function loadAudioRow(where: { publicId: string } | { id: string }): Promise<AudioRow | null> {
  const row = await db.proposal.findUnique({ where, include: AUDIO_INCLUDE });
  return row as AudioRow | null;
}

/** The script this proposal should be speaking, its cache key and its length. */
export function speechFor(row: SpeechRowLike): { script: string; hash: string; seconds: number } {
  const script = buildProposalSpeech(speechInputFromRow(row));
  return { script, hash: speechHash(script), seconds: speechSeconds(script) };
}

/** True when the stored file was read from exactly this script. */
export function isAudioFresh(row: Pick<AudioRow, "audioUrl" | "audioScriptHash">, hash: string): boolean {
  return Boolean(row.audioUrl) && row.audioScriptHash === hash;
}

/** A voice model to read with — else the device reads. */
export function canSynthesize(): boolean {
  return isOpenAIEnabled();
}

/** Where the file is served from; the hash makes the URL immutable. */
export function audioFilePath(publicId: string, hash: string): string {
  return `/api/public-quote/${encodeURIComponent(publicId)}/audio/file?v=${hash}`;
}

type Spoken = { audio: Buffer; model: string; voice: string };

async function synthesize(script: string): Promise<Spoken | null> {
  const client = getOpenAI();
  for (const c of TTS_CANDIDATES) {
    try {
      const res = await client.audio.speech.create({
        model: c.model,
        voice: c.voice,
        input: script,
        response_format: "mp3",
        ...(c.instructions ? { instructions: c.instructions } : {}),
      });
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length > 1_000) return { audio, model: c.model, voice: c.voice };
      console.warn(`[proposalAudio] ${c.model}/${c.voice} returned ${audio.length} bytes`);
    } catch (err) {
      console.warn(`[proposalAudio] ${c.model}/${c.voice} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

/**
 * Read the script, keep the file, remember the hash. Returns the file's
 * path, or null when no voice is configured or every model failed. Never
 * throws — every caller treats the audio as optional.
 */
export async function generateProposalAudio(row: Pick<AudioRow, "id" | "publicId">, script: string, hash: string): Promise<string | null> {
  if (!canSynthesize()) return null;
  try {
    const spoken = await synthesize(script);
    if (!spoken) return null;
    // One row per proposal; a new script replaces the old file. Two plays
    // racing on a cache miss both land and the last write wins — same words,
    // same voice, not worth a lock. The model and voice are kept, so the
    // database says which one a client actually heard.
    await db.proposalAudio.upsert({
      where: { proposalId: row.id },
      create: { proposalId: row.id, hash, model: spoken.model, voice: spoken.voice, bytes: spoken.audio },
      update: { hash, model: spoken.model, voice: spoken.voice, bytes: spoken.audio, createdAt: new Date() },
    });
    const url = audioFilePath(row.publicId, hash);
    await db.proposal.update({ where: { id: row.id }, data: { audioUrl: url, audioScriptHash: hash } });
    return url;
  } catch (err) {
    console.error(`[proposalAudio] generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Make the audio for a proposal that is being sent, so the client's first
 * play is instant. Best-effort and time-boxed: the send never fails, or
 * waits, on a voice model. Whatever does not finish here is made on the
 * first play instead.
 */
export async function warmProposalAudio(proposalId: string, timeoutMs = 20_000): Promise<boolean> {
  if (!canSynthesize()) return false;
  try {
    const row = await loadAudioRow({ id: proposalId });
    if (!row) return false;
    const { script, hash } = speechFor(row);
    if (isAudioFresh(row, hash)) return true;
    const url = await Promise.race([
      generateProposalAudio(row, script, hash),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return Boolean(url);
  } catch (err) {
    console.warn(`[proposalAudio] warm-up skipped: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
