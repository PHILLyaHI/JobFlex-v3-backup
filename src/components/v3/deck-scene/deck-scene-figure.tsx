"use client";
// THE DECK IN 3D ON A PAGE (2026-10-04) — the client's proposal and the
// contractor's saved proposal, like the fence's figure (fence-scene-figure):
// the scene the Deck Studio froze with the proposal, from
// /api/public-quote/[publicId]/deck-scene, stood up by the studio's own
// DeckModel3D. Both arrive only when the figure scrolls near the viewport,
// so a page never scrolled that far never loads Three.js. A "Build it"
// button stands the deck up layer by layer — footings to boards — the way
// the crew will.
import * as React from "react";
import { parseDeckScene, SCENE_LAYERS, type DeckScene } from "@/lib/deck/scene";
import "../fence-scene/fence-scene.css";
import "./deck-scene.css";

type ModelComponent = typeof import("@/components/estimator/deck/DeckModel3D").DeckModel3D;
const LAYERS = SCENE_LAYERS.length;

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function DeckSceneFigure({ src, caption, facts = null, className }: { src: string; caption: string; facts?: string | null; className?: string }) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const started = React.useRef(false);
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [scene, setScene] = React.useState<DeckScene | null>(null);
  const [Model, setModel] = React.useState<ModelComponent | null>(null);
  const [built, setBuilt] = React.useState<number>(LAYERS);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    let cancelled = false;
    const start = async () => {
      if (started.current || cancelled) return;
      started.current = true;
      setState("loading");
      try {
        if (!webglSupported()) throw new Error("no webgl");
        const [res, mod] = await Promise.all([fetch(src), import("@/components/estimator/deck/DeckModel3D")]);
        if (!res.ok) throw new Error(String(res.status));
        const data = parseDeckScene(await res.json());
        if (cancelled) return;
        if (!data) throw new Error("no scene");
        setScene(data);
        setModel(() => mod.DeckModel3D);
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      void start();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [src]);

  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 6000);
      setBuilt(t * LAYERS);
      if (t < 1) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const ready = state === "ready" && Model && scene;
  return (
    <figure className={`jf-fs jf-ds${className ? ` ${className}` : ""}`} data-picture="deck-scene" data-state={state}>
      <div className="jf-fs-frame" ref={frameRef}>
        {ready ? (
          <>
            <Model scene={scene} built={built} className="jf-fs-canvas" label={`The deck in 3D: ${scene.facts}`} />
            <button
              type="button"
              className="jf-ds-build"
              onClick={() => {
                let reduced = false;
                try {
                  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                } catch {
                  reduced = false;
                }
                if (reduced) return;
                setBuilt(0);
                setPlaying(true);
              }}
              disabled={playing}
            >
              {playing ? "Building…" : "Build it"}
            </button>
          </>
        ) : (
          <div className="jf-fs-wait" aria-hidden="true">
            <span>{state === "failed" ? "The 3D view is not available on this device" : "Setting up the 3D view…"}</span>
          </div>
        )}
      </div>
      <figcaption>
        {caption}
        {facts ? <span className="jf-fs-facts">{facts}</span> : null}
      </figcaption>
    </figure>
  );
}
