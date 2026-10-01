"use client";

// DEMO stand-in for hvac-estimator-blueprint/use-hvac-walk.ts (2026-10-01):
// the same return shape, so the form's walk markup renders as it does on the
// real page. A clip picked here is probed and its stills pulled in the
// browser (video-ingest, no upload); the READING needs the model on the
// server, so `read` explains that instead of calling anything.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalkthroughAnalysis } from "@/lib/estimate/video-schema";
import {
  extractFrames,
  frameCountFor,
  probeVideo,
  type VideoFrame,
  type VideoProbe,
} from "@/components/v3/video-estimator-blueprint/video-ingest";

export type WalkStage = "frames" | "audio" | "read";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useHvacWalk(_aiEnabled: boolean) {
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<VideoProbe | null>(null);
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<WalkStage | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [error, setError] = useState("");
  const [audioState] = useState<"pending" | "ok" | "partial" | "none" | "failed">("pending");
  const pickSeq = useRef(0);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const removeFile = useCallback(() => {
    pickSeq.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null); setFile(null); setProbe(null); setFrames([]); setStage(null); setStageNote(""); setError("");
  }, []);

  const pickFile = useCallback(async (f: File) => {
    setError("");
    let p: VideoProbe;
    try { p = await probeVideo(f); } catch (err) { setError(err instanceof Error ? err.message : "Could not read that file."); return; }
    const token = ++pickSeq.current;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(f);
    previewRef.current = url;
    setPreviewUrl(url); setFile(f); setProbe(p); setFrames([]);
    setStage("frames"); setStageNote(`0 / ${frameCountFor(p.duration)}`);
    try {
      const out = await extractFrames(f, p, (done, total) => { if (pickSeq.current === token) setStageNote(`${done} / ${total}`); });
      if (pickSeq.current !== token) return;
      setFrames(out);
    } catch (err) {
      if (pickSeq.current !== token) return;
      setError(err instanceof Error ? err.message : "Could not read the video.");
    } finally {
      if (pickSeq.current === token) { setStage(null); setStageNote(""); }
    }
  }, []);

  const framesReady = frames.length > 0 && stage !== "frames";
  const canRead = !!file && !!probe && framesReady;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const read = useCallback(async (_address: string): Promise<WalkthroughAnalysis | null> => {
    setError("This is the example estimator — the walk is read on your own account. Photograph the plates or type the facts below to see the rest.");
    return null;
  }, []);

  const stageText = stage ? `Pulling stills${stageNote ? ` · ${stageNote}` : ""}` : "";
  const stagePct = stage === "frames" ? 20 : 0;

  return { file, probe, frames, previewUrl, stage, stageText, stagePct, busy: false, error, audioState, canRead, pickFile, removeFile, read };
}
