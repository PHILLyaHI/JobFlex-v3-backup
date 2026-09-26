"use client";

// The video walk, for the HVAC estimator: the same browser-side reading the
// video estimator does (probe → stills → audio → transcript → the model's
// reading), without the pricing steps — here the reading feeds the building
// model and the engine prices deterministically. video-ingest.ts is reused
// as is; only the ticket text differs, so the reader knows what to look for.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { analyzeWalkthrough } from "@/actions/videoEstimator";
import type { WalkthroughAnalysis } from "@/lib/estimate/video-schema";
import { ensureWithinLimit, reportPlanLimitResult } from "@/stores/usePlanLimitStore";
import {
  TranscribeError,
  extractAudioChunks,
  extractFrames,
  frameCountFor,
  probeVideo,
  transcribeChunks,
  transcriptText,
  type VideoFrame,
  type VideoProbe,
} from "@/components/v3/video-estimator-blueprint/video-ingest";

export type WalkStage = "frames" | "audio" | "read";

/** What the reader is told to pull out of an HVAC walk. The labels are the
 *  ones intake.ts matches, so a reading lands on the right fields. */
export const HVAC_WALK_NOTES = [
  "HVAC replacement survey. Read every nameplate and panel you can see and report each figure as its own measurement with these labels:",
  "Square footage · Storeys · Ceiling height · Year built · Bedrooms · Main breaker (amps) · Free breaker slots · Outdoor unit brand · Outdoor unit model · Outdoor unit serial · Outdoor unit tons or BTU · Refrigerant · Furnace brand · Furnace model · Furnace BTU input · AFUE · SEER · Return grille size · Gas pipe size · Static pressure.",
  "Copy model and serial numbers character for character. In observations, say where the ducts run (attic, crawlspace, basement, none) and their condition (good, fair, poor, uninsulated), the foundation (slab, crawlspace, basement), the window type (single-pane, double-pane, low-E), the roof colour and shading, what runs on gas versus electric (furnace, water heater, range, dryer, EV charger), and anything the owner said about keeping gas, going all-electric, noise or comfort complaints.",
].join(" ");

export function useHvacWalk(aiEnabled: boolean) {
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<WalkStage | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audioState, setAudioState] = useState<"pending" | "ok" | "partial" | "none" | "failed">("pending");
  const pickSeq = useRef(0);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const removeFile = useCallback(() => {
    pickSeq.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setFile(null);
    setProbe(null);
    setFrames([]);
    setStage(null);
    setStageNote("");
    setError("");
    setAudioState("pending");
  }, []);

  const pickFile = useCallback(async (f: File) => {
    setError("");
    let p: VideoProbe;
    try {
      p = await probeVideo(f);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read that file.";
      setError(msg);
      toast.error("Can't use that video", msg);
      return;
    }
    const token = ++pickSeq.current;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(f);
    previewRef.current = url;
    setPreviewUrl(url);
    setFile(f);
    setProbe(p);
    setFrames([]);
    setAudioState("pending");
    setStage("frames");
    setStageNote(`0 / ${frameCountFor(p.duration)}`);
    try {
      const out = await extractFrames(f, p, (done, total) => {
        if (pickSeq.current === token) setStageNote(`${done} / ${total}`);
      });
      if (pickSeq.current !== token) return;
      if (out.length === 0) setError("Couldn't pull any frames from this clip — try a different export.");
      setFrames(out);
    } catch (err) {
      if (pickSeq.current !== token) return;
      setError(err instanceof Error ? err.message : "Could not read the video.");
    } finally {
      if (pickSeq.current === token) {
        setStage(null);
        setStageNote("");
      }
    }
  }, []);

  const framesReady = frames.length > 0 && stage !== "frames";
  const canRead = !!file && !!probe && framesReady && !busy;

  /** Transcribe and read the clip. Resolves to the reading, or null when it
   *  failed (the error is already on screen). */
  const read = useCallback(
    async (address: string): Promise<WalkthroughAnalysis | null> => {
      if (!canRead || !file || !probe) return null;
      if (!aiEnabled) {
        const msg = "Video reading needs OPENAI_API_KEY — type the facts below instead.";
        setError(msg);
        toast.error("Estimator not configured", msg);
        return null;
      }
      if (!(await ensureWithinLimit("hvacEstimates")) || !(await ensureWithinLimit("estimatorUses"))) return null;
      setError("");
      setBusy(true);
      setStage("audio");
      setStageNote("");
      try {
        let transcript = "";
        let audio: "ok" | "none" | "failed" = "none";
        let partial = false;
        const chunks = await extractAudioChunks(file, (d, t) => setStageNote(`decoding ${d} / ${t}`));
        if (chunks) {
          try {
            const { segments, failed } = await transcribeChunks(chunks, (d, t) => setStageNote(`${d} / ${t}`));
            if (segments.length) {
              transcript = transcriptText(segments);
              audio = "ok";
              partial = failed > 0;
            } else audio = failed > 0 ? "failed" : "none";
          } catch (err) {
            if (err instanceof TranscribeError && err.code === "PLAN_LIMIT_REACHED") {
              reportPlanLimitResult({ ok: false, error: err.message, code: err.code, resource: err.resource });
              setError(err.message);
              return null;
            }
            audio = "failed";
          }
        }
        setAudioState(partial ? "partial" : audio);
        setStage("read");
        setStageNote("");
        const res = await analyzeWalkthrough({
          frames,
          transcript,
          audioState: audio,
          duration: probe.duration,
          project: "HVAC replacement survey",
          address,
          notes: HVAC_WALK_NOTES,
        });
        if (!res.ok) {
          if (!reportPlanLimitResult(res)) toast.error("Couldn't read the walk", res.error);
          setError(res.error);
          return null;
        }
        return res.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "The reading failed.";
        setError(msg);
        toast.error("Couldn't read the walk", msg);
        return null;
      } finally {
        setBusy(false);
        setStage(null);
        setStageNote("");
      }
    },
    [aiEnabled, canRead, file, frames, probe],
  );

  const stageText = stage
    ? `${stage === "frames" ? "Pulling stills" : stage === "audio" ? "Transcribing the audio" : "Reading the walk"}${stageNote ? ` · ${stageNote}` : ""}`
    : "";
  const stagePct = stage === "frames" ? 20 : stage === "audio" ? 55 : stage === "read" ? 85 : 0;

  return { file, probe, frames, previewUrl, stage, stageText, stagePct, busy, error, audioState, canRead, pickFile, removeFile, read };
}
