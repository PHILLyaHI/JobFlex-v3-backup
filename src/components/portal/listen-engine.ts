// THE PLAYER BEHIND "LISTEN TO THIS PROPOSAL" (2026-09-23) — no framework.
//
// One engine, two skins: the client portal's card (React) and the
// contractor's panel on the proposals page (vanilla DOM). The first tap
// fetches /api/public-quote/<publicId>/audio; with a file, it plays the
// MP3 through an <audio> element and registers with the Media Session so
// the lock screen and the car show play/pause; without one (no voice
// configured, a limited miss, a failed model) the device reads the script
// itself with SpeechSynthesis, one sentence at a time — long utterances get
// cut off by some browsers, sentences do not.
//
// Both unlocks (an <audio>.load() and an empty utterance) run synchronously
// in the tap, before any await: iPhones only grant sound to a user gesture,
// and the fetch would have spent it.

import { speechSentences } from "@/lib/proposalSpeech";

export type ListenStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";
export type ListenMode = "audio" | "device" | null;
export type ListenState = {
  status: ListenStatus;
  mode: ListenMode;
  /** 0..1 */
  progress: number;
  /** Seconds the whole thing takes (estimated until the file says). */
  seconds: number;
  /** Seconds into it. */
  at: number;
  error: string | null;
};

type Payload = { ok: boolean; url?: string | null; script?: string; seconds?: number; error?: string; mode?: string };

const VOICE_PREFERENCE = ["Samantha", "Google US English", "Microsoft Aria Online (Natural)", "Microsoft Jenny", "Ava", "Allison", "Karen", "Daniel"];

export class ListenEngine {
  private audio: HTMLAudioElement | null = null;
  private script = "";
  private sentences: string[] = [];
  private sentence = 0;
  private spokenChars = 0;
  private loaded = false;
  private destroyed = false;
  private watchdog: number | null = null;
  private state: ListenState;

  constructor(
    private readonly publicId: string,
    private readonly meta: { title: string; artist: string },
    private readonly onChange: (s: ListenState) => void,
    seconds = 0,
  ) {
    this.state = { status: "idle", mode: null, progress: 0, seconds, at: 0, error: null };
  }

  get snapshot(): ListenState {
    return this.state;
  }

  /** The play/pause button. */
  async toggle(): Promise<void> {
    if (this.destroyed || this.state.status === "loading") return;
    if (!this.loaded || this.state.status === "error") return this.start();
    if (this.state.status === "playing") return this.pause();
    if (this.state.status === "ended") return this.restart();
    return this.resume();
  }

  /** Audio only — a device voice cannot seek. */
  seek(ratio: number): void {
    const el = this.audio;
    if (!el || this.state.mode !== "audio" || !el.duration) return;
    el.currentTime = Math.max(0, Math.min(1, ratio)) * el.duration;
  }

  skip(seconds: number): void {
    const el = this.audio;
    if (!el || this.state.mode !== "audio" || !el.duration) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + seconds));
  }

  restart(): void {
    if (this.state.mode === "audio" && this.audio) {
      this.audio.currentTime = 0;
      void this.audio.play().catch(() => this.fail("Couldn't play the audio."));
      return;
    }
    if (this.state.mode === "device") {
      this.cancelSpeech();
      this.sentence = 0;
      this.spokenChars = 0;
      this.speakFrom(0);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearWatchdog();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio = null;
    }
    this.cancelSpeech();
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        /* no session to clear */
      }
    }
  }

  // ── loading ────────────────────────────────────────────────────────────

  private async start(): Promise<void> {
    this.unlock();
    this.set({ status: "loading", error: null, progress: 0, at: 0 });
    let body: Payload | null = null;
    try {
      const res = await fetch(`/api/public-quote/${encodeURIComponent(this.publicId)}/audio`, { cache: "no-store" });
      body = (await res.json().catch(() => null)) as Payload | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Couldn't load the audio.");
    } catch (err) {
      this.fail(err instanceof Error ? err.message : "Couldn't load the audio.");
      return;
    }
    if (this.destroyed) return;
    this.script = body.script ?? "";
    this.sentences = speechSentences(this.script);
    if (body.seconds) this.set({ seconds: body.seconds });
    this.loaded = true;
    if (body.url) {
      this.playFile(body.url);
      return;
    }
    if (!this.sentences.length) {
      this.fail("There is nothing to read yet.");
      return;
    }
    this.set({ mode: "device" });
    this.sentence = 0;
    this.spokenChars = 0;
    await this.speakFrom(0);
  }

  /** Spend the tap on both outputs before the fetch takes it. */
  private unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.audio) {
      try {
        const el = new Audio();
        el.preload = "auto";
        el.load();
        this.audio = el;
      } catch {
        this.audio = null;
      }
    }
    try {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* no device voice — the file path still works */
    }
  }

  // ── the file ───────────────────────────────────────────────────────────

  private playFile(url: string): void {
    const el = this.audio ?? new Audio();
    this.audio = el;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) this.set({ seconds: Math.round(el.duration) });
    };
    el.ontimeupdate = () => {
      if (!el.duration) return;
      this.set({ progress: el.currentTime / el.duration, at: Math.floor(el.currentTime) });
    };
    el.onplay = () => this.set({ status: "playing", mode: "audio" });
    el.onpause = () => {
      if (!el.ended) this.set({ status: "paused" });
    };
    el.onended = () => this.set({ status: "ended", progress: 1 });
    // The file is gone, the network dropped it, or the browser refused it:
    // the device reads instead. Both the element's error and the rejected
    // play() can fire for one failure — the fallback runs once.
    el.onerror = () => this.fallbackToDevice("Couldn't play the audio.");
    el.src = url;
    this.mediaSession(el);
    void el.play().catch(() => this.fallbackToDevice("Tap play again to listen."));
  }

  private fallbackToDevice(orError: string): void {
    if (this.destroyed || this.state.mode === "device") return;
    if (!this.sentences.length) {
      this.fail(orError);
      return;
    }
    if (this.audio) {
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    this.set({ mode: "device" });
    this.sentence = 0;
    this.spokenChars = 0;
    void this.speakFrom(0);
  }

  private mediaSession(el: HTMLAudioElement): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: this.meta.title, artist: this.meta.artist });
      navigator.mediaSession.setActionHandler("play", () => void el.play());
      navigator.mediaSession.setActionHandler("pause", () => el.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.skip(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => this.skip(10));
    } catch {
      /* an older browser without the handlers */
    }
  }

  // ── the device's voice ─────────────────────────────────────────────────

  private async speakFrom(index: number): Promise<void> {
    if (this.destroyed) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.fail("This device can't read aloud. Call us instead.");
      return;
    }
    const voice = await pickVoice();
    if (this.destroyed || this.state.mode !== "device") return;
    const text = this.sentences[index];
    if (!text) {
      this.set({ status: "ended", progress: 1 });
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1;
    if (voice) u.voice = voice;
    const total = Math.max(1, this.script.length);
    u.onstart = () => {
      this.clearWatchdog();
      this.set({ status: "playing", mode: "device", progress: this.spokenChars / total, at: Math.round((this.spokenChars / total) * this.state.seconds) });
    };
    u.onboundary = (e) => {
      const p = (this.spokenChars + (e.charIndex || 0)) / total;
      this.set({ progress: p, at: Math.round(p * this.state.seconds) });
    };
    u.onend = () => {
      if (this.destroyed || this.state.status === "paused") return;
      this.spokenChars += text.length + 1;
      this.sentence = index + 1;
      void this.speakFrom(this.sentence);
    };
    u.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      this.fail("This device can't read aloud right now. Call us instead.");
    };
    this.set({ status: "playing", mode: "device" });
    this.clearWatchdog();
    // Some engines fire no events until the end; only a voice that is not
    // speaking at all, ten seconds in, is a voice this device does not have.
    this.watchdog = window.setTimeout(() => {
      const silent = this.state.status === "playing" && this.state.mode === "device" && this.state.progress === this.spokenChars / total;
      if (silent && !window.speechSynthesis.speaking) {
        this.cancelSpeech();
        this.fail("This device can't read aloud right now. Call us instead.");
      }
    }, 10_000);
    window.speechSynthesis.speak(u);
  }

  private cancelSpeech(): void {
    this.clearWatchdog();
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch {
      /* nothing was speaking */
    }
  }

  // ── transport ──────────────────────────────────────────────────────────

  private pause(): void {
    if (this.state.mode === "audio") {
      this.audio?.pause();
      return;
    }
    // A device voice pauses unreliably; stop it and remember the sentence.
    this.set({ status: "paused" });
    this.cancelSpeech();
  }

  private resume(): void {
    if (this.state.mode === "audio") {
      void this.audio?.play().catch(() => this.fail("Tap play again to listen."));
      return;
    }
    void this.speakFrom(this.sentence);
  }

  private fail(message: string): void {
    this.clearWatchdog();
    this.set({ status: "error", error: message });
  }

  private clearWatchdog(): void {
    if (this.watchdog != null && typeof window !== "undefined") window.clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private set(patch: Partial<ListenState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }
}

/** The most natural US English voice this device has; null = the default. */
async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener("voiceschanged", done, { once: true });
      window.setTimeout(done, 700);
    });
  }
  if (!voices.length) return null;
  for (const name of VOICE_PREFERENCE) {
    const v = voices.find((x) => x.name.startsWith(name) && x.lang.toLowerCase().startsWith("en"));
    if (v) return v;
  }
  return (
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    null
  );
}

/** "1:05" */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "About a minute" for the label before anything has loaded. */
export function aboutLabel(seconds: number): string {
  if (!seconds) return "About a minute";
  if (seconds < 50) return `About ${Math.max(15, Math.round(seconds / 15) * 15)} seconds`;
  if (seconds < 80) return "About a minute";
  if (seconds < 105) return "About a minute and a half";
  return `About ${Math.round(seconds / 60)} minutes`;
}
