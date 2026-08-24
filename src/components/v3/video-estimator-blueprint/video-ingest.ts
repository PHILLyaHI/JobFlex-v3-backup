"use client";

// VIDEO ESTIMATOR — reading the clip IN THE BROWSER.
//
// Three things happen to a walkthrough before any model sees it, and all three
// happen on the device that picked the file:
//
//   probeVideo        — is it a video, how long, what size. Rejects > 5 minutes.
//   extractFrames     — seeks a <video> element through the clip and paints up
//                       to 14 evenly spaced stills onto a canvas → JPEG data
//                       URLs (~100–200KB each at 960px).
//   extractAudioChunks— decodes the audio track with Web Audio, renders it to
//                       16kHz mono PCM through an OfflineAudioContext, and cuts
//                       it into ≤100s WAV chunks for the transcribe route.
//
// WHY HERE AND NOT ON A SERVER
// The server has no ffmpeg (Vercel functions) and a 4.5MB request cap; the
// browser has a hardware decoder for exactly this file already. Pulling stills
// and audio locally means the 200MB clip never leaves the phone — roughly 2MB of
// JPEG and a few MB of speech do. It is also what lets the page work with no
// storage bucket configured.
//
// Every function here is best-effort in the same direction: a frame that will
// not seek is skipped, an audio track that will not decode returns null, and
// the caller decides whether to carry on with what it has. Nothing throws past
// `probeVideo`, whose failures ARE the answer ("not a video we can read").

export const MAX_DURATION_S = 300;
export const MAX_FRAMES = 14;
export const MIN_FRAMES = 4;
/** Longest side of a rendered still. */
const FRAME_MAX_W = 960;
const JPEG_Q = 0.72;
const AUDIO_RATE = 16_000;
/** 100s × 16kHz × 16-bit mono = 3.2MB, under the transcribe route's 4MB cap. */
const AUDIO_CHUNK_S = 100;

// ONE token, deliberately. The Windows file dialog resolves every MIME type and
// extension in `accept` against the registry BEFORE it paints, so a list of
// eight made "Add video" feel like it hung for a second or two. `video/*` is one
// lookup, and `isVideoFile` below is the real guard anyway — the dialog filter
// is a convenience, not a check.
export const VIDEO_ACCEPT = "video/*";

export type VideoProbe = { duration: number; width: number; height: number };
export type VideoFrame = { t: number; dataUrl: string };
export type AudioChunk = { offset: number; blob: Blob };

export function isVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** "1080p" / "720p" / "4K" from the frame height — the file line's third fact. */
export function fmtRes(p: VideoProbe): string {
  const h = Math.min(p.width, p.height);
  if (h >= 2000) return "4K";
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  return h ? `${h}p` : "";
}

// ── A <video> we control ────────────────────────────────────────────────────

type Opened = { video: HTMLVideoElement; release: () => void };

function once(el: HTMLVideoElement, ok: string, bad: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      el.removeEventListener(ok, onOk);
      el.removeEventListener(bad, onBad);
      clearTimeout(timer);
      fn();
    };
    const onOk = () => finish(resolve);
    const onBad = () => finish(() => reject(new Error("The browser could not decode this video.")));
    const timer = setTimeout(() => finish(() => reject(new Error("Timed out reading the video."))), ms);
    el.addEventListener(ok, onOk, { once: true });
    el.addEventListener(bad, onBad, { once: true });
  });
}

async function openVideo(file: File): Promise<Opened> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  const release = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };
  try {
    await once(video, "loadedmetadata", "error", 20_000);
  } catch (err) {
    release();
    throw err;
  }
  // MediaRecorder-made WebM carries no duration header; seeking past the end
  // makes the browser scan for it and report the real figure.
  if (!Number.isFinite(video.duration) || video.duration === 0) {
    video.currentTime = 1e7;
    try {
      await once(video, "durationchange", "error", 10_000);
    } catch {
      /* fall through — the check below rejects it */
    }
    video.currentTime = 0;
  }
  return { video, release };
}

// ── Probe ───────────────────────────────────────────────────────────────────

export async function probeVideo(file: File): Promise<VideoProbe> {
  if (!isVideoFile(file)) throw new Error("That is not a video file — MP4, MOV or WebM.");
  const { video, release } = await openVideo(file);
  try {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("The browser could not read this video's length.");
    }
    if (duration > MAX_DURATION_S) {
      throw new Error(`Walkthroughs are capped at 5 minutes — this one is ${fmtClock(duration)}.`);
    }
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("This file has no video track the browser can decode.");
    }
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    release();
  }
}

// ── Frames ──────────────────────────────────────────────────────────────────

/** One frame per ~12s of clip, never fewer than 4 nor more than 14. */
export function frameCountFor(duration: number): number {
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.round(duration / 12)));
}

function frameTimes(duration: number, n: number): number[] {
  // Keep off the very first and last instants — they are often black or a
  // thumb over the lens.
  const pad = Math.min(0.4, duration / 10);
  if (n <= 1) return [Math.min(duration / 2, pad)];
  const span = duration - 2 * pad;
  return Array.from({ length: n }, (_, i) => pad + (span * i) / (n - 1));
}

/** Wait until the frame at the new time has actually been painted — `seeked`
 *  can fire before the decoder delivers it on some engines. */
function painted(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof v.requestVideoFrameCallback === "function") {
      v.requestVideoFrameCallback(done);
      setTimeout(done, 600);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

export async function extractFrames(
  file: File,
  probe: VideoProbe,
  onProgress?: (done: number, total: number) => void,
): Promise<VideoFrame[]> {
  const { video, release } = await openVideo(file);
  const out: VideoFrame[] = [];
  try {
    // Safari will not decode for a canvas until playback has been requested at
    // least once; a muted play/pause satisfies it and is invisible elsewhere.
    try {
      await video.play();
      video.pause();
    } catch {
      /* autoplay refused — seeking still works on the engines that refuse */
    }
    const scale = Math.min(1, FRAME_MAX_W / Math.max(probe.width, probe.height));
    const w = Math.max(1, Math.round(probe.width * scale));
    const h = Math.max(1, Math.round(probe.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");

    const n = frameCountFor(probe.duration);
    const times = frameTimes(probe.duration, n);
    onProgress?.(0, n);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      try {
        video.currentTime = t;
        await once(video, "seeked", "error", 6_000);
        await painted(video);
        ctx.drawImage(video, 0, 0, w, h);
        out.push({ t, dataUrl: canvas.toDataURL("image/jpeg", JPEG_Q) });
      } catch {
        // A frame that will not seek is skipped, not fatal.
      }
      onProgress?.(i + 1, n);
    }
  } finally {
    release();
  }
  return out;
}

/** The handful of stills the intake strip shows: evenly spread across the set. */
export function stripFrames(frames: VideoFrame[], n = 4): VideoFrame[] {
  if (frames.length <= n) return frames;
  return Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (n - 1))]);
}

// ── Audio ───────────────────────────────────────────────────────────────────

function wavFromPcm(samples: Float32Array, rate: number): Blob {
  const bytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * The clip's audio as 16kHz mono WAV chunks, or null when there is nothing
 * usable — no Web Audio, a container the browser cannot demux, no audio track,
 * or a track that is silent end to end.
 */
export async function extractAudioChunks(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<AudioChunk[] | null> {
  const AC: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC || typeof OfflineAudioContext === "undefined") return null;

  onProgress?.(0, 3);
  let decoded: AudioBuffer;
  const ctx = new AC();
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  } finally {
    ctx.close().catch(() => {});
  }
  onProgress?.(1, 3);
  if (!decoded.numberOfChannels || decoded.duration < 0.5) return null;

  // Down-mix and resample in one pass: a mono destination sums the channels.
  const length = Math.ceil(decoded.duration * AUDIO_RATE);
  const off = new OfflineAudioContext(1, length, AUDIO_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  const mono = (await off.startRendering()).getChannelData(0);
  onProgress?.(2, 3);

  // A silent track (screen recording, muted camera) is "no audio", not a
  // transcript of nothing.
  let peak = 0;
  for (let i = 0; i < mono.length; i += 16) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
    if (peak > 0.01) break;
  }
  if (peak <= 0.004) return null;

  const chunks: AudioChunk[] = [];
  const step = AUDIO_CHUNK_S * AUDIO_RATE;
  for (let s = 0; s < mono.length; s += step) {
    chunks.push({ offset: s / AUDIO_RATE, blob: wavFromPcm(mono.subarray(s, s + step), AUDIO_RATE) });
  }
  onProgress?.(3, 3);
  return chunks;
}

// ── Transcription (the route round-trip) ────────────────────────────────────

export type TranscriptSegment = { start: number; end: number; text: string };

export class TranscribeError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public resource?: string,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

async function transcribeChunk(chunk: AudioChunk): Promise<TranscriptSegment[]> {
  const form = new FormData();
  form.append("audio", chunk.blob, "walkthrough.wav");
  form.append("offset", String(chunk.offset));
  const res = await fetch("/api/estimator/video/transcribe", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    resource?: string;
    segments?: TranscriptSegment[];
  };
  if (!res.ok) {
    throw new TranscribeError(body.error ?? `Transcription failed (${res.status})`, res.status, body.code, body.resource);
  }
  return body.segments ?? [];
}

/**
 * Every chunk through the route, two at a time, re-joined in clip order.
 * A chunk that fails for a transient reason is dropped and the rest continue;
 * a plan-limit or auth refusal is rethrown so the caller can stop everything.
 */
export async function transcribeChunks(
  chunks: AudioChunk[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ segments: TranscriptSegment[]; failed: number }> {
  const results: TranscriptSegment[][] = new Array(chunks.length);
  let failed = 0;
  let done = 0;
  let next = 0;
  onProgress?.(0, chunks.length);
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      try {
        results[i] = await transcribeChunk(chunks[i]);
      } catch (err) {
        if (err instanceof TranscribeError && (err.status === 402 || err.status === 403 || err.status === 503)) {
          throw err;
        }
        results[i] = [];
        failed += 1;
      }
      done += 1;
      onProgress?.(done, chunks.length);
    }
  };
  await Promise.all([worker(), worker()]);
  const segments = results.flat().sort((a, b) => a.start - b.start);
  return { segments, failed };
}

/** `[mm:ss] text` per segment — the shape the reader prompt expects. */
export function transcriptText(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.text)
    .map((s) => `[${fmtClock(s.start)}] ${s.text}`)
    .join("\n");
}
