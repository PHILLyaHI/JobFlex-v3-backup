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
// Without an OpenAI key or a Blob token there is no file: the route hands
// the script to the browser, which reads it with the device's own voice.

import { db } from "@/lib/db";
import { getOpenAI, isOpenAIEnabled } from "@/lib/sdk/openai";
import { deleteBlob, isBlobEnabled, uploadBlob } from "@/lib/sdk/blob";
import { buildProposalSpeech, speechHash, speechInputFromRow, speechSeconds, type SpeechRowLike } from "@/lib/proposalSpeech";

const TTS_VOICE = "nova";
const TTS_INSTRUCTIONS =
  "Warm, clear and unhurried: a contractor's office reading a written proposal to a homeowner who is listening in the car. " +
  "Speak every dollar amount and every phone digit distinctly.";
// The newer speech model takes instructions; a project key that is not
// entitled to it answers model_not_found, and the classic tts-1 is next.
const TTS_CANDIDATES: Array<{ model: string; instructions?: string }> = [
  { model: "gpt-4o-mini-tts", instructions: TTS_INSTRUCTIONS },
  { model: "tts-1" },
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

/** A voice model and a place to keep the file — else the device reads. */
export function canSynthesize(): boolean {
  return isOpenAIEnabled() && isBlobEnabled();
}

async function synthesize(script: string): Promise<Buffer | null> {
  const client = getOpenAI();
  for (const c of TTS_CANDIDATES) {
    try {
      const res = await client.audio.speech.create({
        model: c.model,
        voice: TTS_VOICE,
        input: script,
        response_format: "mp3",
        ...(c.instructions ? { instructions: c.instructions } : {}),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1_000) return buf;
      console.warn(`[proposalAudio] ${c.model} returned ${buf.length} bytes`);
    } catch (err) {
      console.warn(`[proposalAudio] ${c.model} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return null;
}

/**
 * Read the script, keep the file, remember the hash. Returns the file's
 * URL, or null when no voice is configured or every model failed. Never
 * throws — every caller treats the audio as optional.
 */
export async function generateProposalAudio(row: Pick<AudioRow, "id" | "audioUrl">, script: string, hash: string): Promise<string | null> {
  if (!canSynthesize()) return null;
  try {
    const audio = await synthesize(script);
    if (!audio) return null;
    const blob = await uploadBlob(`proposal-audio/${row.id}/${hash}.mp3`, audio, { contentType: "audio/mpeg", addRandomSuffix: true });
    // Two plays racing on a cache miss can both land; the last write wins
    // and the loser's file is orphaned — a few hundred kilobytes, not worth a lock.
    const stale = row.audioUrl;
    await db.proposal.update({ where: { id: row.id }, data: { audioUrl: blob.url, audioScriptHash: hash } });
    if (stale && stale !== blob.url) {
      try {
        await deleteBlob(stale);
      } catch {
        /* an orphaned old file is fine */
      }
    }
    return blob.url;
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
