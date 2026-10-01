"use client";
// THE FENCE IN 3D ON A PAGE (2026-09-27) — the client's proposal and the
// contractor's saved proposal. Owner: "when sending the fence proposal to the
// client, send the 3D as well, so they can look."
//
// A figure that stands the estimator's scene up where it is: the scene's data
// comes from /api/public-quote/[publicId]/fence-scene (lib/fence/scene) and
// the scene itself is the studio's FenceModel3D — orbit, zoom, and on a desk
// a click walks through. Both arrive only when the figure scrolls near the
// viewport, so a page that is never scrolled that far never loads Three.js.
// Until then, and where WebGL is missing, the frame shows the poster (the
// studio's snapshot when one was stored) or a quiet waiting panel.
import * as React from "react";
import type { FenceSceneProps } from "@/lib/fence/scene";
import "./fence-scene.css";

type ModelComponent = typeof import("@/components/estimator/fence/FenceModel3D").FenceModel3D;

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function FenceSceneFigure({
  src,
  poster = null,
  caption,
  facts = null,
  className,
}: {
  /** The scene's JSON — this app's own public route. */
  src: string;
  /** A picture to show until the scene is up, and instead of it where it cannot be. */
  poster?: string | null;
  caption: string;
  facts?: string | null;
  className?: string;
}) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const started = React.useRef(false);
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [scene, setScene] = React.useState<FenceSceneProps | null>(null);
  const [Model, setModel] = React.useState<ModelComponent | null>(null);
  // A touch screen gets orbit and zoom only; read once, when the scene is
  // about to mount (before the render that shows it).
  const [controls, setControls] = React.useState<"full" | "orbit">("full");

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
        const [res, mod] = await Promise.all([fetch(src), import("@/components/estimator/fence/FenceModel3D")]);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FenceSceneProps;
        if (cancelled) return;
        if (!Array.isArray(data.points) || data.points.length < 2) throw new Error("no scene");
        let coarse = false;
        try {
          coarse = window.matchMedia("(pointer: coarse)").matches;
        } catch {
          coarse = false;
        }
        setControls(coarse ? "orbit" : "full");
        setScene(data);
        setModel(() => mod.FenceModel3D);
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

  const ready = state === "ready" && Model && scene;
  return (
    <figure className={`jf-fs${className ? ` ${className}` : ""}`} data-picture="fence-scene" data-state={state}>
      <div className="jf-fs-frame" ref={frameRef}>
        {ready ? (
          <Model
            points={scene.points}
            height={scene.height}
            material={scene.material}
            materialColor={scene.materialColor}
            gates={scene.gates}
            selectedSegment={null}
            buildings={scene.buildings}
            terrain={scene.terrain}
            segClasses={scene.segClasses}
            segSteps={scene.segSteps}
            wallMounts={scene.wallMounts}
            lots={scene.lots}
            lotColor={scene.lotColor}
            build={scene.build}
            controls={controls}
            className="jf-fs-canvas"
          />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- the studio's own snapshot, from Blob
          <img className="jf-fs-poster" src={poster} alt="" />
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
