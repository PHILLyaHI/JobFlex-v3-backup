"use client";

// "LISTEN TO THIS PROPOSAL" — the client portal's card (2026-09-23).
//
// Sits in the intro card under the total, on both the desktop tree and the
// handheld rebuild: one tap plays the spoken summary and totals, for a
// client who is driving. The engine (./listen-engine) fetches the file on
// that first tap and falls back to the device's own voice. An email link
// with ?listen=1 scrolls the card into view and lights it — never autoplay,
// browsers block sound without a tap.

import { useEffect, useRef, useState } from "react";
import { aboutLabel, clock, ListenEngine, type ListenState } from "./listen-engine";
import "./listen-card.css";

export function ListenCard({ publicId, title, orgName, seconds }: { publicId: string; title: string; orgName: string; seconds: number }) {
  const [s, setS] = useState<ListenState>({ status: "idle", mode: null, progress: 0, seconds, at: 0, error: null });
  const [lit, setLit] = useState(false);
  const engine = useRef<ListenEngine | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const e = new ListenEngine(publicId, { title, artist: orgName }, setS, seconds);
    engine.current = e;
    return () => e.destroy();
  }, [publicId, title, orgName, seconds]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("listen") !== "1") return;
    const light = window.setTimeout(() => {
      setLit(true);
      box.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    const calm = window.setTimeout(() => setLit(false), 4_300);
    return () => {
      window.clearTimeout(light);
      window.clearTimeout(calm);
    };
  }, []);

  const started = s.status === "playing" || s.status === "paused" || s.status === "ended";
  const label =
    s.status === "loading" ? "Loading…"
    : s.status === "error" ? s.error ?? "Couldn't load the audio."
    : s.status === "ended" ? "That's the whole proposal. Tap to hear it again."
    : started ? `${clock(s.at)} / ${clock(s.seconds)}${s.mode === "device" ? " · read by your device" : ""}`
    : "The summary and the totals, read aloud — for the road.";

  return (
    <div ref={box} className={`jf-listen${lit ? " is-lit" : ""}${s.status === "error" ? " is-error" : ""}`}>
      <button
        type="button"
        className="jf-listen-btn"
        onClick={() => void engine.current?.toggle()}
        disabled={s.status === "loading"}
        aria-label={s.status === "playing" ? "Pause the spoken proposal" : "Play the spoken proposal"}
      >
        {s.status === "loading" ? (
          <svg className="jf-listen-spin" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" /></svg>
        ) : s.status === "playing" ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="5" width="4" height="14" fill="currentColor" /><rect x="14" y="5" width="4" height="14" fill="currentColor" /></svg>
        ) : s.status === "ended" || s.status === "error" ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M5 3v6h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="jf-listen-body">
        <div className="jf-listen-head">
          <svg className="jf-listen-ic" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 13a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="3" y="13" width="4" height="7" rx="1.2" fill="currentColor" /><rect x="17" y="13" width="4" height="7" rx="1.2" fill="currentColor" /></svg>
          <b>Listen to this proposal</b>
          <i>{aboutLabel(s.seconds)}</i>
        </div>
        <div className="jf-listen-sub" aria-live="polite">{label}</div>
        {started ? (
          <div
            className="jf-listen-bar"
            role="slider"
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(s.progress * 100)}
            tabIndex={s.mode === "audio" ? 0 : -1}
            onClick={(e) => {
              if (s.mode !== "audio") return;
              const r = e.currentTarget.getBoundingClientRect();
              engine.current?.seek((e.clientX - r.left) / r.width);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") engine.current?.skip(10);
              if (e.key === "ArrowLeft") engine.current?.skip(-10);
            }}
          >
            <span style={{ width: `${Math.round(s.progress * 100)}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
